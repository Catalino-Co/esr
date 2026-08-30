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

module.exports = {
  findInsufficientStock,
  formatInsufficientStockDetail,
  getIncidentSeverityTone,
  getIncidentStatusBadgeKind,
  isSerializedInventoryItem,
  normalizeSerializedInventoryInput,
  normalizeSerializedRentalLine,
  parseSerialLines,
  shouldDeductStockForConduce,
  shouldReserveStock,
  uniqueSerialLines,
  validateIncidentDraft,
  validateSerialCatalogInput,
  validateSerializedRentalLines
};
