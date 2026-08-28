import { fmt } from '../formatters/number.js';
import { formatDate } from '../formatters/date.js';
import { renderBaseDocument, escapeHtml } from './base-document.js';

export function renderOrderDocument(data) {
	const rows = data.items
		.map(
			(item) => `<tr>
        <td>${escapeHtml(item.name)}</td>
        <td>${escapeHtml(item.internal_code || '—')}</td>
        <td>${escapeHtml(item.quantity)}</td>
        <td>${escapeHtml(item.status || '—')}</td>
        <td>${fmt(item.price)}</td>
        <td>${fmt(item.line_total || Number(item.quantity) * Number(item.price))}</td>
      </tr>`
		)
		.join('');

	const bodyHtml = `
    <section class="doc-section">
      <div class="doc-grid">
        <div><strong>Cliente</strong>${escapeHtml(data.customer?.name || '—')}</div>
        <div><strong>Evento</strong>${escapeHtml(data.event?.name || '—')}</div>
        <div><strong>Estado</strong>${escapeHtml(data.order.status || '—')}</div>
        <div><strong>Fecha</strong>${escapeHtml(formatDate(data.order.date))}</div>
      </div>
    </section>
    <section class="doc-section">
      <h2>Artículos reservados</h2>
      <table class="doc-table">
        <thead><tr><th>Artículo</th><th>Código</th><th>Cant.</th><th>Estado</th><th>Precio</th><th>Total</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6">Sin artículos</td></tr>'}</tbody>
      </table>
      <div class="doc-totals">
        <div class="total"><span>Total orden</span><span>${fmt(data.order.total)}</span></div>
      </div>
    </section>
    ${data.order.notes ? `<div class="doc-notes"><strong>Notas:</strong> ${escapeHtml(data.order.notes)}</div>` : ''}
  `;

	return renderBaseDocument({
		title: `Orden ${data.order.order_number || data.order.id}`,
		company: data.company,
		meta: [
			{ label: 'Número', value: data.order.order_number || String(data.order.id) },
			{ label: 'Fecha', value: formatDate(data.order.date) }
		],
		bodyHtml
	});
}
