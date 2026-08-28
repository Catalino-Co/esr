import { fmt } from '../formatters/number.js';
import { formatDate } from '../formatters/date.js';
import { renderBaseDocument, escapeHtml } from './base-document.js';

export function renderConduceDocument(data) {
	const typeLabel = data.conduce.conduce_type === 'devolucion' ? 'Devolución' : 'Entrega';
	const rows = data.items
		.map(
			(item) => `<tr>
        <td>${escapeHtml(item.name || item.item_id)}</td>
        <td>${escapeHtml(item.internal_code || '—')}</td>
        <td>${escapeHtml(item.quantity)}</td>
        <td>${fmt(item.price)}</td>
      </tr>`
		)
		.join('');

	const bodyHtml = `
    <section class="doc-section">
      <div class="doc-grid">
        <div><strong>Tipo</strong>${escapeHtml(typeLabel)}</div>
        <div><strong>Orden</strong>${escapeHtml(data.order?.order_number || data.conduce.work_order_id || '—')}</div>
        <div><strong>Cliente</strong>${escapeHtml(data.customer?.name || '—')}</div>
        <div><strong>Evento</strong>${escapeHtml(data.event?.name || '—')}</div>
        <div><strong>Recibido por</strong>${escapeHtml(data.conduce.received_by_name || '—')}</div>
        <div><strong>Documento ID</strong>${escapeHtml(data.conduce.received_by_document || '—')}</div>
      </div>
    </section>
    <section class="doc-section">
      <h2>Artículos</h2>
      <table class="doc-table">
        <thead><tr><th>Artículo</th><th>Código</th><th>Cant.</th><th>Precio ref.</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4">Sin artículos</td></tr>'}</tbody>
      </table>
    </section>
    ${data.conduce.notes ? `<div class="doc-notes"><strong>Notas:</strong> ${escapeHtml(data.conduce.notes)}</div>` : ''}
    <div class="signature-box">
      <div class="signature-line">Firma quien entrega</div>
      <div class="signature-line">Firma quien recibe</div>
    </div>
  `;

	return renderBaseDocument({
		title: `Conduce ${data.conduce.note_number || data.conduce.id}`,
		company: data.company,
		meta: [
			{ label: 'Número', value: data.conduce.note_number || String(data.conduce.id) },
			{ label: 'Fecha', value: formatDate(data.conduce.date) }
		],
		bodyHtml
	});
}
