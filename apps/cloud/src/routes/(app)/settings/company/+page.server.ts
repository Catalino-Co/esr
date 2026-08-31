import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { recordAuditLog } from '$lib/server/audit';
import { requirePermission } from '$lib/server/permissions';
import { getCompanySettingsRepository } from '$lib/server/repositories';
import { toTenantContext } from '$lib/server/tenant';
import {
	firstFormError,
	formErrorsToObject,
	validateCloudCompanySettingsInput,
	validateCloudLogoDataUrl
} from '$lib/server/validators';

export const load: PageServerLoad = async ({ locals }) => {
	const { companyId, company } = requirePermission(locals, 'settings.company.update');
	const settings = await getCompanySettingsRepository().get(toTenantContext(companyId));

	return {
		// Sin fila en company_info se parte del nombre del tenant. `logo_base64`
		// va en cadena vacia y no ausente: si no, el <img> saldria con
		// `src="undefined"` en una empresa recien creada.
		settings: settings ?? {
			name: company.name,
			rnc: '',
			phone: '',
			email: '',
			address: '',
			logo_base64: ''
		}
	};
};

export const actions: Actions = {
	default: async ({ request, locals, getClientAddress }) => {
		const { companyId } = requirePermission(locals, 'settings.company.update');
		const form = await request.formData();

		const values = {
			name: String(form.get('name') ?? '').trim(),
			rnc: String(form.get('rnc') ?? '').trim(),
			phone: String(form.get('phone') ?? '').trim(),
			email: String(form.get('email') ?? '').trim(),
			address: String(form.get('address') ?? '').trim()
		};

		/*
		 * El logotipo llega con un VERBO aparte, no con un centinela dentro del
		 * propio valor. Son tres estados y hay que distinguirlos:
		 *
		 *   keep   no lo he tocado   -> la clave ni se manda al repositorio
		 *   set    este es el nuevo  -> se valida y se escribe
		 *   clear  quiero quitarlo   -> se escribe cadena vacia
		 *
		 * Sin el verbo, «no lo he tocado» y «quiero quitarlo» llegan iguales.
		 *
		 * Y lo DESCONOCIDO cae en `keep`, nunca en `clear`: un formulario a medio
		 * construir o un cliente futuro que mande otra cosa no puede acabar
		 * borrando el membrete. La opcion destructiva exige la palabra exacta.
		 */
		const accion = String(form.get('logo_action') ?? 'keep');
		const logoBruto = String(form.get('logo_base64') ?? '');

		let logo: string | undefined;
		if (accion === 'clear') logo = '';
		else if (accion === 'set') logo = logoBruto;

		const errors = validateCloudCompanySettingsInput(values);
		if (accion === 'set') errors.push(...validateCloudLogoDataUrl(logoBruto));

		if (errors.length) {
			return fail(400, {
				error: firstFormError(errors),
				fieldErrors: formErrorsToObject(errors),
				// Con el logo pendiente dentro: si no, un guardado rechazado por el
				// nombre vacio le tira al usuario el logotipo que acababa de subir.
				values: { ...values, logo_base64: accion === 'clear' ? '' : logoBruto },
				logoAction: accion
			});
		}

		await getCompanySettingsRepository().upsert(toTenantContext(companyId), {
			...values,
			// La clave SOLO viaja si hay algo que decir sobre ella. Omitirla es lo
			// que hace que el repositorio la deje en paz.
			...(logo === undefined ? {} : { logo_base64: logo })
		});

		await recordAuditLog({ locals, request, getClientAddress }, {
			action: 'settings.company.updated',
			entity_type: 'company_settings',
			entity_id: companyId,
			description: `Datos de empresa actualizados: ${values.name}`,
			// Que el logo cambie es INVISIBLE en una auditoria sin diff, y
			// «¿quién quitó el logo del membrete?» es justo la pregunta que
			// aparece tres meses después. El data URL NO se guarda aquí: son
			// cientos de KB por fila en una tabla que solo crece.
			metadata: {
				logo: accion === 'set' ? 'actualizado' : accion === 'clear' ? 'eliminado' : 'sin cambios'
			}
		});

		// Solo `success`: `use:enhance` invalida y vuelve a cargar, asi que la
		// pantalla se repinta con lo que la base tiene de verdad. Devolver
		// `values` haria que el data URL bajara otra vez por el cable, y ademas
		// con `keep` no habria logo que enseñar.
		return { success: 'Datos de la empresa guardados.' };
	}
};
