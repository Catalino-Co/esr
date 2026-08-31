const { getQuery, getSingleQuery, runQuery, withTransaction } = require('../connection.cjs');
const { calculateQuoteTotals } = require('@esr/core');

/**
 * Cotizaciones de ESR Pro.
 *
 * Este repositorio estaba MUERTO: nadie lo llamaba y la pantalla de edicion
 * duplicaba —peor— su `replaceItems`. Vuelve a la vida por un motivo concreto,
 * y es el contrario del que hizo borrar el de clientes: una direccion se guarda
 * con UNA sentencia y no necesita transaccion; una cotizacion son `UPDATE` +
 * `DELETE` + N `INSERT`, y `withTransaction` SOLO existe en el proceso
 * principal. Desde el renderer, cada `window.api.db.run` es una invocacion IPC
 * suelta: si la app se cierra entre el DELETE y los INSERT, queda una
 * cotizacion con total y sin lineas, y el DELETE es fisico.
 *
 * CONVENCION de la casa: un metodo con prefijo `tx` asume que ya hay
 * transaccion abierta y no hace BEGIN ni COMMIT.
 */
class SqliteQuoteRepository {
	async findById(id) {
		return await getSingleQuery('SELECT * FROM quotations WHERE id = ?', [id]);
	}

	/**
	 * Las lineas con el nombre y el codigo ya resueltos.
	 *
	 * `is_legacy_package` es UNA regla escrita UNA vez: una linea heredada es la
	 * que tiene `package_id` y no tiene `item_id`. Desde que los paquetes se
	 * explotan en lineas de articulo al agregarlos, ninguna linea nueva puede
	 * cumplirla; las que quedan vienen de documentos ya enviados al cliente.
	 *
	 * El nombre se devuelve PELADO. El adorno —«[Paquete] X»— lo pone
	 * `quoteItemLabel` al pintar, que es lo que evita que el listado escriba
	 * «[PAQUETE] X» y el editor «📦 X» para la misma cotizacion.
	 */
	async listItems(quoteId) {
		return await getQuery(
			`SELECT qi.id, qi.item_id, qi.package_id, qi.quantity, qi.price,
			        qi.discount_rate, qi.tax_rate,
			        COALESCE(i.name, p.name) AS name,
			        i.internal_code AS code,
			        CASE WHEN qi.package_id IS NOT NULL AND qi.item_id IS NULL THEN 1 ELSE 0 END
			          AS is_legacy_package
			   FROM quotation_items qi
			   LEFT JOIN items    i ON qi.item_id    = i.id
			   LEFT JOIN packages p ON qi.package_id = p.id
			  WHERE qi.quotation_id = ?
			  ORDER BY qi.id`,
			[quoteId]
		);
	}

	/** Cabecera y lineas en UNA invocacion IPC, que es como las lee la pantalla. */
	async findForEdit(id) {
		const quote = await this.findById(id);
		if (!quote) return null;
		return { quote, items: await this.listItems(id) };
	}

	/**
	 * Alta o modificacion, ATOMICA.
	 *
	 * Un solo metodo publico y no `create` + `update` + `replaceItems`: la
	 * pantalla guarda la cotizacion entera de una vez, y partirlo en tres es lo
	 * que permitia que se ejecutara solo un trozo.
	 *
	 * Los totales se calculan AQUI, con la misma funcion que usa la pantalla.
	 * Recibirlos del renderer significaria confiar en que el cliente ya
	 * recalculo, y ese es el fallo que la reforma viene a cerrar.
	 */
	async save(input) {
		const lineas = (input.items || []).map((linea) => ({
			item_id: linea.item_id ?? null,
			package_id: linea.package_id ?? null,
			quantity: Number(linea.quantity) || 0,
			price: Number(linea.price) || 0,
			// Tasas en PORCENTAJE. `Number(...) || 0` y no `?? 0`: del renderer
			// llegan como cadena cuando el <input> esta vacio.
			discount_rate: Number(linea.discount_rate) || 0,
			tax_rate: Number(linea.tax_rate) || 0
		}));
		// Sin los dos importes de cabecera: `input.discount` e `input.tax_amount`
		// se ignoran a proposito. Ahora son RESULTADO de las tasas de las lineas.
		const totales = calculateQuoteTotals(lineas);

		return await withTransaction(async () => {
			const id = input.id ? await this.txUpdate(input, totales) : await this.txInsert(input, totales);
			await this.txReplaceItems(id, lineas);
			return { quote: await this.findById(id), items: await this.listItems(id) };
		});
	}

	/**
	 * Siguiente numero libre.
	 *
	 * Lee el maximo y suma uno, igual que el de Postgres. Aqui la carrera es
	 * mucho mas improbable —ESR Pro es un solo proceso y un solo usuario— pero
	 * la llamada va DENTRO de la transaccion de `save`, asi que entre leer el
	 * maximo e insertar no se cuela nadie. Y si algo se colara, el indice unico
	 * de la migracion 0012 lo convierte en un error en vez de en dos
	 * cotizaciones con el mismo numero.
	 *
	 * `ORDER BY id DESC` y no `MAX(quote_number)`: el numero es texto, asi que
	 * ordenarlo alfabeticamente daria la respuesta correcta solo hasta que
	 * cambie el ancho del relleno.
	 */
	async nextQuoteNumber() {
		const filas = await getQuery(
			`SELECT quote_number FROM quotations
			 WHERE quote_number IS NOT NULL AND quote_number <> ''
			 ORDER BY id DESC LIMIT 1`
		);
		const ultimo = filas[0]?.quote_number;
		const siguiente = ultimo ? Number(String(ultimo).replace(/\D/g, '')) + 1 : 1;
		return `COT-${String(siguiente).padStart(6, '0')}`;
	}

	async txInsert(input, totales) {
		const quoteNumber = await this.nextQuoteNumber();
		const result = await runQuery(
			`INSERT INTO quotations
			   (client_id, event_id, date, validity_days, subtotal, discount, tax_amount,
			    total, status, notes, conditions, quote_number)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				input.client_id,
				input.event_id || null,
				input.date || '',
				Number(input.validity_days) || 15,
				totales.subtotal,
				totales.discount,
				totales.tax_amount,
				totales.total,
				input.status || 'borrador',
				input.notes || '',
				input.conditions || '',
				quoteNumber
			]
		);
		return result.id;
	}

	async txUpdate(input, totales) {
		await runQuery(
			`UPDATE quotations SET
			   client_id = ?, event_id = ?, date = ?, validity_days = ?,
			   subtotal = ?, discount = ?, tax_amount = ?, total = ?,
			   status = ?, notes = ?, conditions = ?
			 WHERE id = ?`,
			[
				input.client_id,
				input.event_id || null,
				input.date || '',
				Number(input.validity_days) || 15,
				totales.subtotal,
				totales.discount,
				totales.tax_amount,
				totales.total,
				input.status || 'borrador',
				input.notes || '',
				input.conditions || '',
				input.id
			]
		);
		return input.id;
	}

	/**
	 * UNA sola sentencia de insercion, con todas las columnas y `package_id`
	 * explicito aunque sea NULL.
	 *
	 * La version anterior tenia DOS `INSERT` con listas de columnas distintas
	 * segun `is_package`, y ese es el camino por el que un guardado inocente
	 * convierte una linea heredada en una fila sin `item_id` ni `package_id`:
	 * una linea que ya no se puede identificar ni etiquetar.
	 */
	async txReplaceItems(quoteId, lineas) {
		await runQuery('DELETE FROM quotation_items WHERE quotation_id = ?', [quoteId]);
		for (const linea of lineas) {
			await runQuery(
				`INSERT INTO quotation_items
					(quotation_id, item_id, package_id, quantity, price, discount_rate, tax_rate)
				 VALUES (?, ?, ?, ?, ?, ?, ?)`,
				[
					quoteId,
					linea.item_id,
					linea.package_id,
					linea.quantity,
					linea.price,
					linea.discount_rate,
					linea.tax_rate
				]
			);
		}
	}
}

module.exports = { SqliteQuoteRepository };
