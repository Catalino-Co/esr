const RESERVED_RENTAL_STATUSES = ['preparado', 'cargado'];
const STOCK_DEDUCTING_CONDUCE_STATUSES = ['emitido', 'entregado'];
const CONDUCE_STOCK_DEDUCTING_STATUSES = ['emitido', 'entregado'];

function shouldReserveStock(status) {
  return RESERVED_RENTAL_STATUSES.includes(status);
}

function shouldDeductStockForConduce(status) {
  return STOCK_DEDUCTING_CONDUCE_STATUSES.includes(status);
}

function planRentalOrderStatusForSave(input) {
  const shouldReserve = shouldReserveStock(input.targetStatus) && !shouldReserveStock(input.originalStatus);

  return {
    shouldReserve,
    statusForSave: shouldReserve ? input.originalStatus : input.targetStatus
  };
}

function mergeRentalOrderItem(items, item) {
  const existing = items.find((line) => line.item_id === item.item_id);
  if (existing) {
    return items.map((line) =>
      line.item_id === item.item_id
        ? { ...line, quantity: Number(line.quantity || 0) + Number(item.quantity || 0) }
        : line
    );
  }

  return [...items, { ...item }];
}

function calculateQuoteLineTotal(input) {
  return Number(input.quantity || 0) * Number(input.price || 0);
}

function calculateQuoteTotals(items, discount = 0) {
  const subtotal = items.reduce((sum, item) => {
    const total = item.total ?? calculateQuoteLineTotal(item);
    return sum + Number(total || 0);
  }, 0);
  const normalizedDiscount = Number(discount) || 0;

  return {
    subtotal,
    discount: normalizedDiscount,
    total: subtotal - normalizedDiscount
  };
}

function calculateCommittedStock(reservations) {
  const committed = new Map();

  for (const reservation of reservations) {
    committed.set(
      reservation.item_id,
      (committed.get(reservation.item_id) || 0) + Number(reservation.quantity || 0)
    );
  }

  return committed;
}

function calculateAvailableStock(totalQuantity, committedQuantity) {
  return Math.max(0, Number(totalQuantity || 0) - Number(committedQuantity || 0));
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

function calculateConduceLineTotal(line) {
  return Number(line.quantity || 0) * Number(line.price || 0);
}

function calculateConduceTotals(items, discount = 0) {
  const subtotal = items.reduce((sum, item) => {
    const total = item.total ?? calculateConduceLineTotal(item);
    return sum + Number(total || 0);
  }, 0);
  const normalizedDiscount = Number(discount) || 0;

  return {
    subtotal,
    discount: normalizedDiscount,
    total: subtotal - normalizedDiscount
  };
}

function shouldDeductStockForConduceStatus(status) {
  return CONDUCE_STOCK_DEDUCTING_STATUSES.includes(status);
}

function validateConduceDraft(input) {
  return input.work_order_id
    ? { ok: true, value: input }
    : { ok: false, error: 'conduce.work_order_id.required' };
}

function buildConduceReference(id) {
  return `COND-${String(id ?? '').padStart(5, '0')}`;
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
  CONDUCE_STOCK_DEDUCTING_STATUSES,
  RESERVED_RENTAL_STATUSES,
  STOCK_DEDUCTING_CONDUCE_STATUSES,
  calculateAvailableStock,
  calculateCommittedStock,
  calculateConduceLineTotal,
  calculateConduceTotals,
  calculateQuoteLineTotal,
  calculateQuoteTotals,
  buildConduceReference,
  findInsufficientStock,
  formatInsufficientStockDetail,
  getIncidentSeverityTone,
  getIncidentStatusBadgeKind,
  isSerializedInventoryItem,
  mergeRentalOrderItem,
  normalizeSerializedInventoryInput,
  normalizeSerializedRentalLine,
  parseSerialLines,
  planRentalOrderStatusForSave,
  shouldDeductStockForConduce,
  shouldDeductStockForConduceStatus,
  shouldReserveStock,
  uniqueSerialLines,
  validateConduceDraft,
  validateIncidentDraft,
  validateSerialCatalogInput,
  validateSerializedRentalLines
};
