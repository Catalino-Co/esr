import { fmt } from '../formatters/number.js';
import { formatDate } from '../formatters/date.js';
import { renderBaseDocument, escapeHtml } from './base-document.js';

/**
 * Los datos llegan tal cual salen de PostgreSQL, asi que los campos opcionales
 * pueden venir como `null` y no solo como `undefined`, y los NUMERIC llegan
 * como string. Los typedef reflejan eso en vez de declararlos `object`, que
 * dejaba sin comprobar todo el cuerpo de la plantilla.
 *
 * @typedef {{
 *   id?: string|number|null, quote_number?: string|null, date?: string|null,
 *   valid_until?: string|null, status?: string|null, notes?: string|null,
 *   subtotal?: number|string|null, discount?: number|string|null,
 *   tax_amount?: number|string|null, total?: number|string|null
 * }} DocQuote
 * @typedef {{
 *   name?: string|null, code?: string|null,
 *   quantity?: number|string|null, price?: number|string|null, total?: number|string|null
 * }} DocQuoteItem
 */

/**
 * Cotizacion imprimible.
 *
 * @param {{
 *   company: import('./base-document.js').DocCompany;
 *   quote: DocQuote;
 *   customer?: { name?: string|null }|null;
 *   event?: { name?: string|null }|null;
 *   items: DocQuoteItem[];
 * }} data
 */
export function renderQuoteDocument(data) {
	const rows = data.items
		.map(
			(item) => `<tr>
        <td>${escapeHtml(item.name)}</td>
        <td>${escapeHtml(item.code || '—')}</td>
        <td>${escapeHtml(item.quantity)}</td>
        <td>${fmt(item.price ?? 0)}</td>
        <td>${fmt(item.total || Number(item.quantity) * Number(item.price))}</td>
      </tr>`
		)
		.join('');

	const bodyHtml = `
    <section class="doc-section">
      <div class="doc-grid">
        <div><strong>Cliente</strong>${escapeHtml(data.customer?.name || '—')}</div>
        <div><strong>Evento</strong>${escapeHtml(data.event?.name || '—')}</div>
        <div><strong>Estado</strong>${escapeHtml(data.quote.status || '—')}</div>
        <div><strong>Validez</strong>${escapeHtml(formatDate(data.quote.valid_until || data.quote.date))}</div>
      </div>
    </section>
    <section class="doc-section">
      <h2>Artículos</h2>
      <table class="doc-table">
        <thead><tr><th>Artículo</th><th>Código</th><th>Cant.</th><th>Precio</th><th>Total</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5">Sin artículos</td></tr>'}</tbody>
      </table>
      <div class="doc-totals">
        <div><span>Subtotal</span><span>${fmt(data.quote.subtotal ?? 0)}</span></div>
        <div><span>Descuento</span><span>${fmt(data.quote.discount ?? 0)}</span></div>
        <div><span>Impuestos</span><span>${fmt(data.quote.tax_amount ?? 0)}</span></div>
        <div class="total"><span>Total</span><span>${fmt(data.quote.total ?? 0)}</span></div>
      </div>
    </section>
    ${data.quote.notes ? `<div class="doc-notes"><strong>Notas:</strong> ${escapeHtml(data.quote.notes)}</div>` : ''}
  `;

	return renderBaseDocument({
		title: `Cotización ${data.quote.quote_number || data.quote.id}`,
		company: data.company,
		meta: [
			{ label: 'Número', value: data.quote.quote_number || String(data.quote.id) },
			{ label: 'Fecha', value: formatDate(data.quote.date) }
		],
		bodyHtml
	});
}
