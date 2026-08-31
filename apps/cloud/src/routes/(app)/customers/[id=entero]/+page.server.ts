import { error, fail } from '@sveltejs/kit';
import {
	RECORD_STATE,
	RECORD_STATE_LABELS,
	SELECTABLE_STATES,
	can,
	isRecordState,
	parseDocumentType,
	parsePaymentTerms
} from '@esr/core';
import type { RecordState } from '@esr/core';
import type { Actions, PageServerLoad } from './$types';
import {
	getClientAddressRepository,
	getClientAddressTypeRepository,
	getCommercialSectorRepository,
	getCustomerRepository
} from '$lib/server/repositories';
import { optionalText, text } from '$lib/server/catalogs';
import { recordAuditLog } from '$lib/server/audit';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';
import { firstFormError, formErrorsToObject, validateCloudCustomerInput } from '$lib/server/validators';

/**
 * Ficha del cliente. Dos formularios independientes conviven en la pantalla:
 * el del cliente a la izquierda y el directorio de direcciones a la derecha.
 *
 * Todas las actions devuelven un `scope` para que la pagina sepa sobre cual de
 * las dos tarjetas pintar el mensaje. Sin eso, guardar una direccion sacaba un
 * «Cambios guardados» encima del formulario del cliente.
 */

export const load: PageServerLoad = async ({ locals, params }) => {
	const { companyId } = requirePermission(locals, 'customers.view');
	const ctx = toTenantContext(companyId);

	const customer = await getCustomerRepository().findById(ctx, params.id);
	if (!customer) error(404, 'Cliente no encontrado');

	const [addresses, addressTypes, sectors] = await Promise.all([
		// Activas e inactivas. Las archivadas se sacan de la vista igual que en
		// cualquier listado; se llega a ellas con `?addresses=0`.
		getClientAddressRepository().listByClient(ctx, params.id, { state: SELECTABLE_STATES }),
		getClientAddressTypeRepository().list(ctx, { state: RECORD_STATE.ACTIVE }),
		// El sector actual del cliente puede estar pausado: se ofrecen los
		// seleccionables para no perderlo al guardar.
		getCommercialSectorRepository().list(ctx, { state: SELECTABLE_STATES })
	]);

	return { customer, addresses, addressTypes, sectors };
};

/** Lee el sector comprobando que sea de ESTA empresa. */
async function readSectorId(companyId: string, form: FormData): Promise<string | null> {
	const raw = text(form, 'sector_id');
	if (!raw) return null;
	// El repositorio filtra por company_id: un id de otra empresa vuelve null y
	// se descarta. Sin esto, el `<select>` es una sugerencia y el formulario
	// acepta cualquier numero que alguien escriba a mano.
	const sector = await getCommercialSectorRepository().findById(toTenantContext(companyId), raw);
	return sector ? raw : null;
}

/**
 * Las tres columnas heredables: `null` significa «hereda del cliente».
 *
 * La casilla viaja como un input con nombre propio y NO como un `disabled` en
 * el campo. Deshabilitar funcionaria por accidente —un input deshabilitado no
 * se envia y el servidor recibiria ausencia— y el dia que alguien lo cambie a
 * `readonly` para poder copiar el texto, empezaria a guardar copias congeladas
 * sin que nadie lo note.
 */
function readInheritable(form: FormData, field: string): string | null {
	return text(form, `inherit_${field}`) ? null : optionalText(form, field);
}

export const actions: Actions = {
	update: async (event) => {
		const { companyId, role } = requirePermission(event.locals, 'customers.update');
		const ctx = toTenantContext(companyId);
		const form = await event.request.formData();

		const current = await getCustomerRepository().findById(ctx, event.params.id);
		if (!current) error(404, 'Cliente no encontrado');

		const values = {
			name: text(form, 'name'),
			email: text(form, 'email'),
			phone: text(form, 'phone'),
			address: text(form, 'address'),
			contact_person: text(form, 'contact_person'),
			notes: text(form, 'notes'),
			document_id: text(form, 'document_id'),
			// `null` cuando el valor no esta en el conjunto: el CHECK de
			// PostgreSQL lo rechazaria con un 500 feo, y SQLite lo tragaria.
			document_type: parseDocumentType(form.get('document_type')),
			payment_terms: parsePaymentTerms(form.get('payment_terms')),
			sector_id: await readSectorId(companyId, form)
		};

		const validationErrors = validateCloudCustomerInput(values);
		if (validationErrors.length) {
			return fail(400, {
				scope: 'customer',
				error: firstFormError(validationErrors),
				fieldErrors: formErrorsToObject(validationErrors)
			});
		}

		/**
		 * El estado NO viaja gratis dentro de esta action.
		 *
		 * Antes vivia en `?/setState`, protegido con `customers.archive`. Al
		 * mudarlo al formulario principal, que exige `customers.update`, un rol
		 * con permiso de editar y sin permiso de archivar podria archivar
		 * clientes. Ocultar el select en la pagina no es un control: se lee solo
		 * si el llamante puede, y si no, se ignora.
		 */
		const puedeArchivar = can(role, 'customers.archive');
		const pedido = Number(form.get('is_active'));
		const nextState: RecordState =
			puedeArchivar && isRecordState(pedido) ? pedido : (current.is_active as RecordState) ?? RECORD_STATE.ACTIVE;

		await getCustomerRepository().update(ctx, event.params.id, { ...values, is_active: nextState });

		await recordAuditLog(event, {
			action: 'customer.updated',
			entity_type: 'customer',
			entity_id: String(event.params.id),
			description: `Cliente actualizado: ${values.name}`
		});

		// El cambio de estado conserva su propio evento de auditoria. Si solo
		// quedara `customer.updated`, se perderia una señal que alguien puso a
		// proposito para poder responder «¿quien archivo este cliente?».
		if (Number(current.is_active) !== nextState) {
			await recordAuditLog(event, {
				action: 'record.state_changed',
				entity_type: 'customer',
				entity_id: String(event.params.id),
				description: `Cliente «${values.name}» → ${RECORD_STATE_LABELS[nextState]}`
			});
		}

		return { scope: 'customer', success: 'Cambios guardados.' };
	},

	saveAddress: async (event) => {
		const { companyId } = requirePermission(event.locals, 'customers.update');
		const ctx = toTenantContext(companyId);
		const form = await event.request.formData();

		const id = text(form, 'id');
		const label = text(form, 'label');
		const address = text(form, 'address');

		// `values` viaja en todo `fail`: el dialogo se re-renderiza al recibir la
		// respuesta y sin esto se quedaria vacio.
		const values = Object.fromEntries(form);
		if (!label) return fail(400, { scope: 'address', error: 'El detalle es obligatorio.', values });
		if (!address) return fail(400, { scope: 'address', error: 'La dirección es obligatoria.', values });

		const typeRaw = text(form, 'address_type_id');
		const tipo = typeRaw
			? await getClientAddressTypeRepository().findById(ctx, typeRaw)
			: null;

		const data = {
			label,
			address,
			address_type_id: tipo ? typeRaw : null,
			contact_person: readInheritable(form, 'contact_person'),
			phone: readInheritable(form, 'phone'),
			email: readInheritable(form, 'email'),
			mobile: optionalText(form, 'mobile'),
			notes: optionalText(form, 'notes'),
			is_primary: text(form, 'is_primary') === '1'
		};

		try {
			const saved = id
				? await getClientAddressRepository().update(ctx, id, data)
				: await getClientAddressRepository().create(ctx, { ...data, client_id: event.params.id });

			await recordAuditLog(event, {
				action: id ? 'customer.address_updated' : 'customer.address_created',
				entity_type: 'client_address',
				entity_id: String(saved.id),
				description: `Dirección ${id ? 'actualizada' : 'creada'}: ${saved.label}`
			});

			return { scope: 'address', success: `«${saved.label}» ${id ? 'se actualizó' : 'se agregó'}.` };
		} catch (err) {
			// El indice unico parcial es la barrera real contra el duplicado.
			const message = err instanceof Error ? err.message : '';
			if (message.includes('client_addresses_label_unique')) {
				return fail(400, {
					scope: 'address',
					error: `Ya existe una dirección llamada «${label}» para este cliente.`,
					values
				});
			}
			throw err;
		}
	},

	setAddressState: async (event) => {
		const { companyId } = requirePermission(event.locals, 'customers.update');
		const ctx = toTenantContext(companyId);
		const form = await event.request.formData();

		const id = text(form, 'id');
		const pedido = Number(form.get('state'));
		if (!id) return fail(400, { scope: 'address', error: 'Falta el identificador.' });
		if (!isRecordState(pedido)) return fail(400, { scope: 'address', error: 'Estado no válido.' });

		const entry = await getClientAddressRepository().findById(ctx, id);
		if (!entry) return fail(404, { scope: 'address', error: 'Dirección no encontrada.' });

		await getClientAddressRepository().setState(ctx, id, pedido);

		await recordAuditLog(event, {
			action: 'customer.address_state_changed',
			entity_type: 'client_address',
			entity_id: String(id),
			description: `Dirección «${entry.label}» → ${RECORD_STATE_LABELS[pedido]}`
		});

		return {
			scope: 'address',
			success: `«${entry.label}» ahora está ${RECORD_STATE_LABELS[pedido].toLowerCase()}.`
		};
	},

	setPrimaryAddress: async (event) => {
		const { companyId } = requirePermission(event.locals, 'customers.update');
		const ctx = toTenantContext(companyId);
		const form = await event.request.formData();

		const id = text(form, 'id');
		if (!id) return fail(400, { scope: 'address', error: 'Falta el identificador.' });

		const entry = await getClientAddressRepository().findById(ctx, id);
		if (!entry) return fail(404, { scope: 'address', error: 'Dirección no encontrada.' });
		if (Number(entry.is_active) !== RECORD_STATE.ACTIVE) {
			return fail(400, { scope: 'address', error: 'Una dirección inactiva no puede ser la principal.' });
		}

		await getClientAddressRepository().setPrimary(ctx, event.params.id, id);

		return { scope: 'address', success: `«${entry.label}» es ahora la dirección principal.` };
	}
};
