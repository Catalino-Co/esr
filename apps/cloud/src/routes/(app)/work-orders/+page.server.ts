import type { PageServerLoad } from './$types';
import { parsePeriodo, periodoDeRango, rangoDelPeriodo } from '@esr/core';
import {
	getCompanySettingsRepository,
	getCustomerRepository,
	getEventRepository,
	getRentalRepository
} from '$lib/server/repositories';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { companyId } = requirePermission(locals, 'work_orders.view');
	const ctx = toTenantContext(companyId);
	const search = url.searchParams.get('search')?.trim() || undefined;
	const status = url.searchParams.get('status')?.trim() || undefined;
	// `dateFrom`/`dateTo` y no `desde`/`hasta`: son los nombres que ya usan
	// `/settings/audit` y `/reports/orders`, y quien compare un reporte con el
	// listado ve las mismas claves.
	const desdeUrl = url.searchParams.get('dateFrom')?.trim() || '';
	const hastaUrl = url.searchParams.get('dateTo')?.trim() || '';

	/*
	 * La VENTANA de fechas.
	 *
	 * El ajuste de empresa manda SOLO cuando la URL no trae ninguna de las dos
	 * fechas. Ni redirección ni parámetros escritos a la fuerza: la URL se queda
	 * limpia, y compartir `/work-orders` le da a quien lo abra SU mes en curso,
	 * que es lo que significa «por defecto».
	 *
	 * Y basta con que llegue UNA para que el ajuste deje de aplicarse: borrar
	 * «Desde» y dejar «Hasta» es como se pide todo lo anterior a una fecha, y si
	 * el valor por defecto se colara de vuelta, esa consulta sería imposible.
	 *
	 * OJO: `new Date()` corre en el SERVIDOR. Sin `TZ` puesta, Node usa UTC, y
	 * para un inquilino en UTC-4 el día 1 entre las 00:00 y las 04:00 locales el
	 * servidor todavía cree que es el mes anterior. El despliegue debe fijar
	 * `TZ=America/Santo_Domingo`; la ventana es por servidor, no por inquilino.
	 */
	const usaDefecto = !desdeUrl && !hastaUrl;
	// El ajuste solo se lee cuando de verdad decide algo: en la navegación normal
	// —teclear, cambiar de estado— la URL ya trae el rango y esta consulta sobra.
	const porDefecto = usaDefecto
		? rangoDelPeriodo(
				parsePeriodo((await getCompanySettingsRepository().get(ctx))?.default_order_range)
			)
		: null;
	const desde = porDefecto ? porDefecto.desde : desdeUrl;
	const hasta = porDefecto ? porDefecto.hasta : hastaUrl;
	// Ni se corrige ni se rechaza: se deja pasar y el vacío lo explica. Cero
	// resultados sin decir por qué es el peor desenlace posible.
	const invertido = Boolean(desde && hasta && desde > hasta);

	// Sin `state`: el listado ya no ofrece el eje de circulacion, y sin el
	// `appendStateFilter` del repositorio cae en `DEFAULT_RECORD_STATE`, que es
	// «activas». Una orden se retira CANCELANDOLA, que es su estado de negocio.
	// La columna sigue en la tabla y la usan los reportes.
	const orders = await getRentalRepository().list(ctx, {
		search,
		status,
		date_from: desde || undefined,
		date_to: hasta || undefined,
		// Uno de más para saber si se corta, y decirlo. `appendPagination` topa en
		// 200 de todas formas: pedir más no trae más.
		limit: 101,
		offset: 0
	});
	const customers = await getCustomerRepository().list(ctx, { limit: 500, offset: 0 });
	const events = await getEventRepository().list(ctx, { limit: 500, offset: 0 });

	const customerMap = new Map(customers.map((c) => [c.id, c.name]));
	const eventMap = new Map(events.map((e) => [e.id, e.name]));

	const hayMas = orders.length > 100;

	return {
		orders: orders.slice(0, 100).map((order) => ({
			...order,
			client_name: order.client_id ? customerMap.get(order.client_id) ?? '—' : '—',
			event_name: order.event_id ? eventMap.get(order.event_id) ?? '—' : '—'
		})),
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
