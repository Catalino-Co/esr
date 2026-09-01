/**
 * Los campos del evento, leidos de un formulario.
 *
 * Uno solo para el alta y para la edicion: son el MISMO formulario, y tenerlo
 * dos veces es como se separaron las dos pantallas de cotizaciones.
 *
 * Los doce campos de ESR Pro. Cloud solo sacaba siete a pantalla, aunque las
 * columnas existen en las dos bases desde el esquema inicial.
 *
 * Ya NO lee `quotation_id` ni `work_order_id`: el vinculo con la cotizacion y
 * con la orden dejo de ser un campo de este formulario. No basta con dejar de
 * usarlos —`ValoresEvento` se deriva de este tipo de retorno, asi que las dos
 * claves muertas viajarian dentro del `values` que `fail()` devuelve para
 * repoblar un formulario que ya no las tiene—.
 */
export type ValoresEvento = ReturnType<typeof leerEvento>;

export function leerEvento(form: FormData) {
	const texto = (clave: string) => String(form.get(clave) ?? '').trim();
	return {
		name: texto('name'),
		client_id: texto('client_id'),
		event_type: texto('event_type'),
		date: texto('date'),
		departure_time: texto('departure_time'),
		setup_time: texto('setup_time'),
		pickup_date: texto('pickup_date'),
		pickup_time: texto('pickup_time'),
		location: texto('location'),
		responsible_person: texto('responsible_person'),
		notes: texto('notes'),
		status: texto('status') || 'tentativo'
	};
}
