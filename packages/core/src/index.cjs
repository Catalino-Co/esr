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

function findInsufficientStock(requested, stock) {
  const stockById = new Map(stock.map((item) => [item.item_id, item]));

  return requested
    .map((line) => ({ ...line, ...stockById.get(line.item_id) }))
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
