/**
 * Reglas de negocio de ESR en CommonJS.
 *
 * ATENCION: este archivo NO es el `index.ts` compilado. `@esr/core` tiene
 * exports condicionales —`import` resuelve al TypeScript, `require` aqui— y las
 * dos implementaciones se escriben a mano por separado, porque `@esr/schemas`
 * no tiene rama `require` y el TypeScript depende de el.
 *
 * Quien lo consume: SOLO
 * `packages/db-sqlite/src/repositories/sqlite-inventory.repository.cjs`, que se
 * ejecuta en el proceso principal de Electron (CommonJS obligado por
 * `main: electron/main.cjs` y por el binding nativo de sqlite3).
 *
 * Se podo lo que no usaba nadie. `findInsufficientStock` y
 * `formatInsufficientStockDetail` siguen aqui aunque el TypeScript las borro por
 * considerarlas muertas: ese diagnostico salio de un grep que solo miraba `.ts`
 * y no veia este mundo. Aqui estan vivas.
 */

const RESERVED_RENTAL_STATUSES = ['preparado', 'cargado'];
const STOCK_DEDUCTING_CONDUCE_STATUSES = ['emitido', 'entregado'];
function shouldReserveStock(status) {
  return RESERVED_RENTAL_STATUSES.includes(status);
}

function shouldDeductStockForConduce(status) {
  return STOCK_DEDUCTING_CONDUCE_STATUSES.includes(status);
}

/**
 * Que articulos no alcanzan para lo pedido.
 *
 * AGREGA `requested` por articulo antes de comparar. Antes no lo hacia, y por
 * eso comparaba LINEA A LINEA: una orden con el mismo articulo en dos lineas de
 * 3 y 4 unidades, con 5 disponibles, pasaba el control dos veces (3<=5, 4<=5) y
 * despues descontaba 7 de 5. Depender de que quien llama traiga las filas ya
 * agrupadas es una trampa: el camino del conduce las agrupaba y el de la orden
 * no.
 *
 * El orden del spread tambien importa: `line` va DESPUES para que la cantidad
 * pedida gane sobre cualquier `quantity` que traiga la fila de stock. Al reves
 * —como estaba— una llamada con dos arrays distintos habria comparado el stock
 * contra si mismo sin avisar.
 */
function findInsufficientStock(requested, stock) {
  const stockById = new Map(stock.map((item) => [item.item_id, item]));

  const pedidoPorItem = new Map();
  for (const line of requested) {
    const previo = pedidoPorItem.get(line.item_id);
    if (previo) {
      previo.quantity = Number(previo.quantity || 0) + Number(line.quantity || 0);
      continue;
    }
    pedidoPorItem.set(line.item_id, { ...line, quantity: Number(line.quantity || 0) });
  }

  return [...pedidoPorItem.values()]
    .map((line) => ({ ...stockById.get(line.item_id), ...line }))
    .filter((line) => line.available_quantity !== undefined && Number(line.available_quantity) < Number(line.quantity));
}

function formatInsufficientStockDetail(items) {
  return items
    .map((item) => `${item.internal_code || ''} ${item.name || ''}`.trim())
    .filter(Boolean)
    .join(', ');
}

function isSerializedInventoryItem(item) {
  return item?.item_type === 'serializado' || Number(item?.uses_serial || 0) === 1;
}

function parseSerialLines(value) {
  return value
    .split(/\r?\n/)
    .map((serial) => serial.trim())
    .filter(Boolean);
}

function uniqueSerialLines(serials) {
  return [...new Set(serials)];
}

function normalizeSerializedInventoryInput(item, serialNumbers) {
  if (!isSerializedInventoryItem(item)) {
    return { ...item, item_type: 'cantidad', uses_serial: 0 };
  }

  const uniqueSerials = uniqueSerialLines(serialNumbers);
  return {
    ...item,
    item_type: 'serializado',
    uses_serial: 1,
    total_quantity: uniqueSerials.length,
    available_quantity: uniqueSerials.length
  };
}

function validateSerialCatalogInput(serialNumbers) {
  const uniqueSerials = uniqueSerialLines(serialNumbers);
  return uniqueSerials.length > 0
    ? { ok: true, value: uniqueSerials }
    : { ok: false, error: 'serials.required' };
}

function normalizeSerializedRentalLine(line) {
  if (!isSerializedInventoryItem(line)) return line;
  return {
    ...line,
    quantity: line.serial_ids?.length || 0
  };
}

function validateSerializedRentalLines(lines) {
  for (const line of lines) {
    if (isSerializedInventoryItem(line) && (!line.serial_ids || line.serial_ids.length === 0)) {
      return { ok: false, error: `serials.selection.required:${line.item_id}` };
    }
  }

  return { ok: true, value: lines.map(normalizeSerializedRentalLine) };
}

function validateIncidentDraft(input) {
  return input.item_id
    ? { ok: true, value: input }
    : { ok: false, error: 'incident.item_id.required' };
}

function getIncidentStatusBadgeKind(status) {
  switch (status) {
    case 'resuelto':
    case 'cobrado':
      return 'success';
    case 'reportado':
      return 'secondary';
    case 'en reparación':
      return 'warning';
    case 'pérdida total':
      return 'danger';
    default:
      return 'primary';
  }
}

function getIncidentSeverityTone(severity) {
  if (severity === 'alta') return 'danger';
  if (severity === 'media') return 'warning';
  return 'info';
}

/**
 * Gemelo de `calculateQuoteLineTotal` y `calculateQuoteTotals` de
 * `src/quotes/use-cases.ts`.
 *
 * Lo necesita `sqlite-quote.repository.cjs`, que corre en el proceso principal
 * de Electron y por tanto no puede importar el TypeScript.
 *
 * SI CAMBIA LA FORMULA, CAMBIA EN LOS DOS. Que el total que ve el usuario y el
 * que se escribe en disco salgan de formulas distintas es exactamente el fallo
 * que este modulo viene a evitar, asi que hay una prueba que compara las dos
 * implementaciones: `packages/core/test/quote-totals.test.cjs`.
 *
 * Recordatorio de semantica: `discount_rate` y `tax_rate` de cada linea son
 * PORCENTAJES; el `discount` y el `tax_amount` que salen de
 * `calculateQuoteTotals` son los IMPORTES que resultan de sumarlas.
 */
function round2(value) {
  const n = Number(value) || 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function calculateQuoteLineTotal(line) {
  return round2((Number(line.quantity) || 0) * (Number(line.price) || 0));
}

function calculateQuoteLineAmounts(line) {
  // `?? calculateQuoteLineTotal(line)` y no `|| ...`: una linea con bruto 0 es
  // legitima —un articulo de cortesia— y con `||` se recalcularia.
  const gross = round2(
    line.total === null || line.total === undefined ? calculateQuoteLineTotal(line) : line.total
  );
  const discount = round2((gross * (Number(line.discount_rate) || 0)) / 100);
  const taxable = round2(gross - discount);
  const tax = round2((taxable * (Number(line.tax_rate) || 0)) / 100);

  return { gross, discount, taxable, tax, total: round2(taxable + tax) };
}

function calculateQuoteTotals(items) {
  let subtotal = 0;
  let discount = 0;
  let tax_amount = 0;

  for (const item of items || []) {
    const linea = calculateQuoteLineAmounts(item);
    subtotal += linea.gross;
    discount += linea.discount;
    tax_amount += linea.tax;
  }

  subtotal = round2(subtotal);
  discount = round2(discount);
  tax_amount = round2(tax_amount);

  return { subtotal, discount, tax_amount, total: round2(subtotal - discount + tax_amount) };
}

/**
 * Gemelo de `src/quotes/use-cases.ts`. Lo necesita `sqlite-invoice.repository.cjs`
 * para rechazar una factura directa de una cotizacion que no este `aprobada`,
 * o que ya se haya facturado por completo.
 */
function validateQuoteCanInvoiceDirectly(quote, billableLines) {
  if (quote.status !== 'aprobada') return { ok: false, error: 'quote.must_be_approved_to_invoice' };
  if (!billableLines.length) return { ok: false, error: 'quote.nothing_billable' };
  return { ok: true, value: true };
}

/**
 * Gemelo de `src/invoices/use-cases.ts`. Ver alli el porque de cada regla: el
 * comentario no se repite aqui para no arriesgarse a que las dos copias
 * diverjan en la EXPLICACION mientras el codigo se mantiene igual a mano.
 */
function invoiceLineKind(line) {
  if (line.item_id != null) return 'item';
  if (line.service_id != null) return 'service';
  return 'manual';
}

function validateInvoiceDraft(draft) {
  const { source } = draft;

  if (source.kind === 'work_order') {
    if (!source.work_order_id) return { ok: false, error: 'invoice.order.required' };
    if (!source.conduce_ids.length && !(source.service_line_ids && source.service_line_ids.length)) {
      return { ok: false, error: 'invoice.order.lines_required' };
    }
  } else if (source.kind === 'quotation') {
    if (!source.quotation_id) return { ok: false, error: 'invoice.quotation.required' };
    if (!source.lines.length) return { ok: false, error: 'invoice.quotation.lines_required' };
    for (const linea of source.lines) {
      const cantidad = Number(linea.quantity);
      if (!Number.isFinite(cantidad) || cantidad <= 0) return { ok: false, error: 'invoice.line.quantity_invalid' };
    }
  } else if (source.kind === 'free') {
    if (!source.client_id) return { ok: false, error: 'invoice.client.required' };
    if (!source.lines.length) return { ok: false, error: 'invoice.lines.required' };

    for (const linea of source.lines) {
      const tieneArticulo = Boolean(linea.item_id);
      const tieneServicio = Boolean(linea.service_id);
      if (tieneArticulo && tieneServicio) return { ok: false, error: 'invoice.line.both_refs' };
      if (!tieneArticulo && !tieneServicio && !String(linea.description || '').trim()) {
        return { ok: false, error: 'invoice.line.unidentified' };
      }

      const cantidad = Number(linea.quantity);
      if (!Number.isFinite(cantidad) || cantidad <= 0) return { ok: false, error: 'invoice.line.quantity_invalid' };
      const precio = Number(linea.price);
      if (!Number.isFinite(precio) || precio < 0) return { ok: false, error: 'invoice.line.price_invalid' };

      if (linea.discount_rate != null) {
        const tasa = Number(linea.discount_rate);
        if (!Number.isFinite(tasa) || tasa < 0 || tasa > 100) return { ok: false, error: 'invoice.line.rate_invalid' };
      }
      if (linea.tax_rate != null) {
        const tasa = Number(linea.tax_rate);
        if (!Number.isFinite(tasa) || tasa < 0) return { ok: false, error: 'invoice.line.rate_invalid' };
      }
    }
  } else {
    return { ok: false, error: 'invoice.source.invalid' };
  }

  if (draft.discount != null) {
    const descuento = Number(draft.discount);
    if (!Number.isFinite(descuento) || descuento < 0) return { ok: false, error: 'invoice.discount.invalid' };
  }
  if (draft.tax_amount != null) {
    const impuesto = Number(draft.tax_amount);
    if (!Number.isFinite(impuesto) || impuesto < 0) return { ok: false, error: 'invoice.discount.invalid' };
  }

  return { ok: true, value: true };
}

const INVOICE_DRAFT_ERRORS = {
  'invoice.order.required': 'Falta la orden de trabajo.',
  'invoice.order.lines_required': 'Elija al menos una entrega o un servicio para facturar.',
  'invoice.quotation.required': 'Falta la cotización.',
  'invoice.quotation.lines_required': 'Elija al menos una línea de la cotización para facturar.',
  'invoice.client.required': 'Elija el cliente.',
  'invoice.lines.required': 'Agregue al menos una línea a la factura.',
  'invoice.line.both_refs': 'Una línea no puede ser artículo y servicio a la vez.',
  'invoice.line.unidentified': 'Escriba una descripción para la línea manual.',
  'invoice.line.quantity_invalid': 'Las cantidades tienen que ser mayores que cero.',
  'invoice.line.price_invalid': 'Los precios no pueden ser negativos.',
  'invoice.line.rate_invalid': 'Las tasas de descuento e impuesto no son válidas.',
  'invoice.discount.invalid': 'El descuento y el impuesto no pueden ser negativos.',
  'invoice.source.invalid': 'La factura no indica un origen válido.',
  'quote.must_be_approved_to_invoice': 'Solo se puede facturar directamente una cotización aprobada.',
  'quote.nothing_billable': 'Esta cotización ya está facturada por completo.',
  'quote_item.already_billed': 'Esa línea ya está facturada: anule la factura para poder modificarla.'
};

function invoiceDraftErrorMessage(code) {
  return INVOICE_DRAFT_ERRORS[code || ''] || 'No se pudo emitir la factura.';
}

module.exports = {
  calculateQuoteLineAmounts,
  calculateQuoteLineTotal,
  calculateQuoteTotals,
  round2,
  findInsufficientStock,
  formatInsufficientStockDetail,
  getIncidentSeverityTone,
  getIncidentStatusBadgeKind,
  invoiceDraftErrorMessage,
  invoiceLineKind,
  isSerializedInventoryItem,
  normalizeSerializedInventoryInput,
  normalizeSerializedRentalLine,
  parseSerialLines,
  shouldDeductStockForConduce,
  shouldReserveStock,
  uniqueSerialLines,
  validateIncidentDraft,
  validateInvoiceDraft,
  validateQuoteCanInvoiceDirectly,
  validateSerialCatalogInput,
  validateSerializedRentalLines
};
