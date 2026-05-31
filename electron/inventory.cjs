const { db, getQuery, getSingleQuery, runQuery } = require('./db/index.cjs');

const RESERVED_STATUSES = new Set(['preparado', 'cargado']);

async function reserveWorkOrderStock(workOrderId, targetStatus) {
  if (!workOrderId) {
    throw new Error('Orden de trabajo inválida.');
  }

  await runQuery('BEGIN IMMEDIATE TRANSACTION');

  try {
    const existing = await getSingleQuery(
      `SELECT COUNT(*) as count
       FROM work_order_stock_reservations
       WHERE work_order_id = ? AND status = 'reserved'`,
      [workOrderId]
    );

    if ((existing?.count || 0) > 0) {
      await updateWorkOrderStatusIfProvided(workOrderId, targetStatus);
      await runQuery('COMMIT');
      return { reserved: false, reason: 'already_reserved' };
    }

    const rows = await getQuery(
      `SELECT wi.item_id, wi.quantity, i.name, i.internal_code, i.available_quantity
       FROM work_order_items wi
       JOIN items i ON wi.item_id = i.id
       WHERE wi.work_order_id = ?`,
      [workOrderId]
    );

    if (rows.length === 0) {
      await updateWorkOrderStatusIfProvided(workOrderId, targetStatus);
      await runQuery('COMMIT');
      return { reserved: false, reason: 'empty_order' };
    }

    const insufficient = rows.filter((row) => Number(row.available_quantity) < Number(row.quantity));
    if (insufficient.length > 0) {
      const detail = insufficient
        .map((row) => `${row.internal_code || ''} ${row.name}`.trim())
        .join(', ');
      throw new Error(`Stock insuficiente para reservar: ${detail}`);
    }

    for (const row of rows) {
      await runQuery(
        `UPDATE items
         SET available_quantity = available_quantity - ?
         WHERE id = ?`,
        [row.quantity, row.item_id]
      );

      await runQuery(
        `INSERT INTO work_order_stock_reservations
          (work_order_id, item_id, quantity, status)
         VALUES (?, ?, ?, 'reserved')`,
        [workOrderId, row.item_id, row.quantity]
      );
    }

    await updateWorkOrderStatusIfProvided(workOrderId, targetStatus);
    await runQuery('COMMIT');
    return { reserved: true, item_count: rows.length };
  } catch (error) {
    await rollbackQuietly();
    throw error;
  }
}

async function reserveIfNeeded(workOrderId, status) {
  if (!RESERVED_STATUSES.has(status)) {
    return { reserved: false, reason: 'status_not_reserved' };
  }

  return await reserveWorkOrderStock(workOrderId, status);
}

async function updateWorkOrderStatusIfProvided(workOrderId, status) {
  if (!status) return;
  await runQuery('UPDATE work_orders SET status = ? WHERE id = ?', [status, workOrderId]);
}

async function rollbackQuietly() {
  return new Promise((resolve) => {
    db.run('ROLLBACK', () => resolve());
  });
}

module.exports = {
  reserveIfNeeded,
  reserveWorkOrderStock
};
