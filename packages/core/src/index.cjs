const RESERVED_RENTAL_STATUSES = ['preparado', 'cargado'];
const STOCK_DEDUCTING_CONDUCE_STATUSES = ['emitido', 'entregado'];

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

module.exports = {
  RESERVED_RENTAL_STATUSES,
  STOCK_DEDUCTING_CONDUCE_STATUSES,
  calculateAvailableStock,
  calculateCommittedStock,
  calculateQuoteLineTotal,
  calculateQuoteTotals,
  findInsufficientStock,
  formatInsufficientStockDetail,
  mergeRentalOrderItem,
  planRentalOrderStatusForSave,
  shouldDeductStockForConduce,
  shouldReserveStock
};
