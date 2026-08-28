import { fmt } from '../formatters/number.js';
import { formatDate } from '../formatters/date.js';
import { renderBaseDocument, escapeHtml } from './base-document.js';

/**
 * @param {{ company: object; quote: object; customer?: object; event?: object; items: object[] }} data
 */
export function renderQuoteDocument(data) {
	const rows = data.items
		.map(
			(item) => `<tr>
        <td>${escapeHtml(item.name)}</td>
        <td>${escapeHtml(item.code || '—')}</td>
        <td>${escapeHtml(item.quantity)}</td>
        <td>${fmt(item.price)}</td>
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
        <div><span>Subtotal</span><span>${fmt(data.quote.subtotal)}</span></div>
        <div><span>Descuento</span><span>${fmt(data.quote.discount)}</span></div>
        <div><span>Impuestos</span><span>${fmt(data.quote.tax_amount)}</span></div>
        <div class="total"><span>Total</span><span>${fmt(data.quote.total)}</span></div>
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
