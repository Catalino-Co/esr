import { formatDateTime } from '../formatters/date.js';
import { renderBaseDocument, escapeHtml } from './base-document.js';
import { fmt } from '../formatters/number.js';

export function renderChecklistDocument(data) {
	const typeLabel = data.type === 'retorno' ? 'Retorno' : 'Salida';
	const rows = data.items
		.map(
			(item) => `<tr>
        <td>${escapeHtml(item.item_name || item.item_id)}</td>
        <td>${escapeHtml(item.expected_quantity)}</td>
        <td>${escapeHtml(item.actual_quantity)}</td>
        <td>${item.is_damaged ? 'Sí' : 'No'}</td>
        <td>${item.is_missing ? 'Sí' : 'No'}</td>
        <td>${escapeHtml(item.notes || '—')}</td>
      </tr>`
		)
		.join('');

	const bodyHtml = `
    <section class="doc-section">
      <div class="doc-grid">
        <div><strong>Tipo</strong>Checklist de ${escapeHtml(typeLabel)}</div>
        <div><strong>Orden</strong>${escapeHtml(data.order?.order_number || data.workOrderId || '—')}</div>
        <div><strong>Cliente</strong>${escapeHtml(data.customer?.name || '—')}</div>
        <div><strong>Evento</strong>${escapeHtml(data.event?.name || '—')}</div>
      </div>
    </section>
    <section class="doc-section">
      <h2>Items revisados</h2>
      <table class="doc-table">
        <thead><tr><th>Artículo</th><th>Esperado</th><th>Confirmado</th><th>Dañado</th><th>Faltante</th><th>Notas</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6">Sin items</td></tr>'}</tbody>
      </table>
    </section>
  `;

	return renderBaseDocument({
		title: `Checklist ${typeLabel}`,
		company: data.company,
		meta: [{ label: 'Generado', value: formatDateTime(new Date().toISOString()) }],
		bodyHtml
	});
}

export function renderIncidentDocument(data) {
	const bodyHtml = `
    <section class="doc-section">
      <div class="doc-grid">
        <div><strong>Tipo</strong>${escapeHtml(data.incident.type)}</div>
        <div><strong>Severidad</strong>${escapeHtml(data.incident.severity || '—')}</div>
        <div><strong>Estado</strong>${escapeHtml(data.incident.status || '—')}</div>
        <div><strong>Orden</strong>${escapeHtml(data.order?.order_number || data.incident.work_order_id || '—')}</div>
        <div><strong>Costo estimado</strong>${fmt(data.incident.estimated_cost)}</div>
        <div><strong>Fecha reporte</strong>${escapeHtml(formatDateTime(data.incident.created_at || data.incident.date))}</div>
      </div>
    </section>
    <section class="doc-section">
      <h2>Descripción</h2>
      <div class="doc-notes">${escapeHtml(data.incident.description || '—')}</div>
    </section>
    ${data.incident.notes ? `<div class="doc-notes"><strong>Notas:</strong> ${escapeHtml(data.incident.notes)}</div>` : ''}
  `;

	return renderBaseDocument({
		title: `Incidencia #${data.incident.id}`,
		company: data.company,
		meta: [{ label: 'Estado', value: data.incident.status || '—' }],
		bodyHtml
	});
}
