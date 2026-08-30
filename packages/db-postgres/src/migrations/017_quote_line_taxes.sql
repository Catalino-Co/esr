-- Descuento e impuesto por LINEA de cotizacion, en porcentaje.
--
-- Antes, `quotations.discount` y `quotations.tax_amount` eran dos importes
-- sueltos que se tecleaban en la cabecera de la ficha y no guardaban ninguna
-- relacion con lo cotizado: nadie podia decir de que salia ese impuesto.
-- Ahora cada linea lleva su tasa y la cabecera guarda la SUMA.
--
-- Las columnas de la cabecera NO se borran: pasan de ser dato de entrada a ser
-- resultado calculado, que es lo que se imprime en el documento. Borrarlas
-- obligaria a recalcular en cada lectura y dejaria los PDF ya emitidos sin
-- forma de reproducirse.

ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS discount_rate NUMERIC(6, 3) DEFAULT 0;
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(6, 3) DEFAULT 0;

-- ── Traspaso de las cotizaciones existentes ──────────────────────────────
--
-- Cada cotizacion que tenga descuento o impuesto en la cabecera reparte esos
-- importes entre sus lineas como una tasa uniforme. Se elige el reparto
-- PROPORCIONAL y no cero porque asi el total recalculado coincide con el que
-- ya estaba guardado, salvo redondeo al centimo: un documento ya enviado al
-- cliente no puede cambiar de importe por una migracion.
--
-- El orden importa y es el mismo que el de la formula: la tasa de impuesto se
-- calcula sobre la base YA rebajada, no sobre el bruto.
WITH bases AS (
	SELECT
		q.id,
		q.company_id,
		q.discount::numeric AS descuento,
		q.tax_amount::numeric AS impuesto,
		-- La misma expresion que usa `calculateQuoteTotals`: el `total` guardado
		-- manda, y solo se cae a cantidad x precio cuando es NULL. Un total 0
		-- explicito es una linea de cortesia y se respeta.
		SUM(COALESCE(qi.total, qi.quantity * qi.price))::numeric AS bruto
	FROM quotations q
	JOIN quotation_items qi
		ON qi.quotation_id = q.id AND qi.company_id = q.company_id
	GROUP BY q.id, q.company_id, q.discount, q.tax_amount
	HAVING SUM(COALESCE(qi.total, qi.quantity * qi.price)) > 0
)
UPDATE quotation_items qi
SET
	discount_rate = ROUND(b.descuento * 100 / b.bruto, 3),
	tax_rate = CASE
		WHEN b.bruto - b.descuento > 0
			THEN ROUND(b.impuesto * 100 / (b.bruto - b.descuento), 3)
		ELSE 0
	END
FROM bases b
WHERE qi.quotation_id = b.id
	AND qi.company_id = b.company_id
	AND (b.descuento <> 0 OR b.impuesto <> 0);

-- Los importes de la cabecera se dejan como estan: ya son la suma correcta.
-- El primer `syncTotals` que toque cada cotizacion los reescribira con la suma
-- de las lineas, que por construccion es el mismo numero.
