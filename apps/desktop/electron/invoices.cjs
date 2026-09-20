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
  searchInvoices: envolver((termino, limite) => invoices.searchByNumber(termino, limite)),
  findInvoice: envolver((id) => invoices.findById(id)),
  findInvoiceForDocument: envolver((id) => invoices.findForDocument(id)),
  listInvoiceItems: envolver((id) => invoices.listItems(id)),
  listInvoiceConduces: envolver((id) => invoices.listConduces(id)),
  // `options` es NUEVO y opcional -hoy solo lo manda la pantalla de editar un
  // borrador, con `{ alsoClaimedByInvoiceId }`- para que la lista de lo
  // facturable tambien traiga lo que YA reclamo ese borrador y no solo lo que
  // sigue libre. Sin el, el repositorio se comporta como siempre.
  listBillableConduces: envolver((workOrderId, options) => invoices.listBillableConduces(workOrderId, options)),
  listBillableServices: envolver((workOrderId, options) => invoices.listBillableServices(workOrderId, options)),
  listBillableQuotationItems: envolver((quotationId, options) =>
    invoices.listBillableQuotationItems(quotationId, options)
  ),
  listOrdersWithBillable: envolver((options) => invoices.listOrdersWithBillable(options)),
  listQuotationsWithBillable: envolver((options) => invoices.listQuotationsWithBillable(options)),
  findInvoiceByConduce: envolver((conduceId) => invoices.findActiveByConduce(conduceId)),
  previewInvoiceLines: envolver((conduceIds) => invoices.previewLines(conduceIds)),
  createInvoice: envolver((input) => invoices.create(input)),
  updateDraftInvoice: envolver((id, input) => invoices.updateDraft(id, input)),
  finalizeInvoice: envolver((id) => invoices.finalize(id)),
  // La anulacion necesita el repositorio de cobros porque los anula dentro de su
  // misma transaccion.
  cancelInvoice: envolver((id, reason) => invoices.cancel(id, reason, payments)),
  setInvoiceState: envolver((id, state) => invoices.setState(id, state)),

  listPayments: envolver((invoiceId) => payments.listForInvoice(invoiceId)),
  createPayment: envolver((input) => payments.create(input)),
  voidPayment: envolver((id, reason) => payments.voidPayment(id, reason)),
  clientBalance: envolver((clientId) => payments.summaryForClient(clientId))
};
