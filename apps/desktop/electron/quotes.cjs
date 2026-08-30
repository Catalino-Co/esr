const { repositories } = require('./db/index.cjs');

/**
 * Puente fino entre el IPC y el repositorio de cotizaciones.
 *
 * Calcado de `invoices.cjs`, incluido su contrato: todo devuelve
 * `{ ok: true, data }` o `{ ok: false, error }` en vez de lanzar, porque
 * `ipcRenderer.invoke` serializa un Error del proceso principal anteponiendo
 * «Error invoking remote method 'x': Error: » al mensaje, y aqui los mensajes
 * son la interfaz.
 *
 * Sin logica propia: si aparece una regla de negocio en este archivo, esta en
 * el sitio equivocado y debe bajar al repositorio, que es quien tiene la
 * transaccion.
 *
 * Los CATALOGOS —articulos, paquetes, clientes— siguen yendo por
 * `window.api.db` con SQL crudo. Son lecturas y no necesitan nada de esto.
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

const quotes = repositories.quotes;

module.exports = {
  findQuote: envolver((id) => quotes.findById(id)),
  listQuoteItems: envolver((id) => quotes.listItems(id)),
  findQuoteForEdit: envolver((id) => quotes.findForEdit(id)),
  saveQuote: envolver((input) => quotes.save(input))
};
