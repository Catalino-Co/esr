import type { PageServerLoad } from './$types';
import { parsePeriodo, periodoDeRango, rangoDelPeriodo } from '@esr/core';
import { getCompanySettingsRepository, getInvoiceRepository } from '$lib/server/repositories';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { companyId } = requirePermission(locals, 'invoices.view');
	const ctx = toTenantContext(companyId);

	const search = url.searchParams.get('search')?.trim() || undefined;
	const status = url.searchParams.get('status')?.trim() || undefined;
	// `dateFrom`/`dateTo`, mismos nombres que Órdenes y Cotizaciones.
	const desdeUrl = url.searchParams.get('dateFrom')?.trim() || '';
	const hastaUrl = url.searchParams.get('dateTo')?.trim() || '';

	// La VENTANA de fechas: el ajuste de empresa manda solo cuando la URL no
	// trae ninguna de las dos. Mismo patrón que Órdenes/Cotizaciones.
	const usaDefecto = !desdeUrl && !hastaUrl;
	const porDefecto = usaDefecto
		? rangoDelPeriodo(
				parsePeriodo((await getCompanySettingsRepository().get(ctx))?.default_invoice_range)
			)
		: null;
	const desde = porDefecto ? porDefecto.desde : desdeUrl;
	const hasta = porDefecto ? porDefecto.hasta : hastaUrl;
	const invertido = Boolean(desde && hasta && desde > hasta);

	// Sin `state`: el listado ya no ofrece el eje de circulacion, y sin el
	// `appendStateFilter` del repositorio cae en `DEFAULT_RECORD_STATE`, que es
	// «activas». Una factura se retira ANULANDOLA, que es su estado de negocio.
	// Archivar/restaurar sigue en la ficha (`?/setState`), que no se toca.
	const invoices = await getInvoiceRepository().list(ctx, {
		search,
		status,
		date_from: desde || undefined,
		date_to: hasta || undefined,
		// Uno de más para saber si se corta, y decirlo.
		limit: 101,
		offset: 0
	});

	const hayMas = invoices.length > 100;

	return {
		invoices: invoices.slice(0, 100),
		search: search ?? '',
		status: status ?? '',
		dateFrom: desde,
		dateTo: hasta,
		/** El botón de rango rápido que va encendido, o `null` si es a medida. */
		rangoActivo: periodoDeRango(desde, hasta),
		invertido,
		hayMas
	};
};
