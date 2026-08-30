const { repositories } = require('./db/index.cjs');

/**
 * Puente fino entre el IPC y los repositorios de facturas y cobros.
 *
 * Sin logica propia: si aparece una regla de negocio aqui, esta en el sitio
 * equivocado y debe bajar al repositorio, que es quien tiene la transaccion.
 *
 * Todo devuelve `{ ok: true, data }` o `{ ok: false, error }` en vez de lanzar.
 * Motivo: `ipcRenderer.invoke` serializa un Error lanzado en el main anteponiendo
 * «Error invoking remote method 'x': Error: » al mensaje. En este modulo los
 * mensajes de negocio SON la interfaz —«esa entrega ya se facturó»— y no pueden
 * llegar a la pantalla con ese prefijo delante.
 */
function envolver(fn) {
  return async (...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (error) {
      return { ok: false, error: String(error?.message || 'Error inesperado.') };
    }
  };
}

const invoices = repositories.invoices;
const payments = repositories.payments;

module.exports = {
  listInvoices: envolver((filters) => invoices.list(filters)),
  findInvoice: envolver((id) => invoices.findById(id)),
  listInvoiceItems: envolver((id) => invoices.listItems(id)),
  listInvoiceConduces: envolver((id) => invoices.listConduces(id)),
  listBillableConduces: envolver((workOrderId) => invoices.listBillableConduces(workOrderId)),
  listOrdersWithBillable: envolver((options) => invoices.listOrdersWithBillable(options)),
  findInvoiceByConduce: envolver((conduceId) => invoices.findActiveByConduce(conduceId)),
  previewInvoiceLines: envolver((conduceIds) => invoices.previewLines(conduceIds)),
  createInvoice: envolver((input) => invoices.create(input)),
  // La anulacion necesita el repositorio de cobros porque los anula dentro de su
  // misma transaccion.
  cancelInvoice: envolver((id, reason) => invoices.cancel(id, reason, payments)),
  setInvoiceState: envolver((id, state) => invoices.setState(id, state)),

  listPayments: envolver((invoiceId) => payments.listForInvoice(invoiceId)),
  createPayment: envolver((input) => payments.create(input)),
  voidPayment: envolver((id, reason) => payments.voidPayment(id, reason)),
  clientBalance: envolver((clientId) => payments.summaryForClient(clientId))
};
