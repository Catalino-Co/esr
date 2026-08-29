import { fmt } from '../formatters/number.js';
import { formatDate } from '../formatters/date.js';
import { renderBaseDocument, escapeHtml } from './base-document.js';

/**
 * @typedef {{
 *   id?: string|number|null, number?: string|null, date?: string|null, status?: string|null,
 *   terms?: string|null, notes?: string|null,
 *   client_name?: string|null, event_name?: string|null, quote_number?: string|null,
 *   [key: string]: unknown
 * }} DocContract
 * @typedef {{
 *   date?: string|null, method?: string|null, reference?: string|null,
 *   status?: string|null, amount?: number|string
 * }} DocPayment
 * @typedef {{ total: number, paid: number, balance: number, settled: boolean }} DocSummary
 */

/**
 * Contrato imprimible.
 *
 * El contrato no guarda importes propios: el monto acordado es el de la
 * cotización enlazada, y el estado de cuenta se calcula con los pagos que le
 * afectan. Ambos llegan ya resueltos en `summary`.
 *
 * @param {{
 *   company: import('./base-document.js').DocCompany;
 *   contract: DocContract;
 *   customer?: { name?: string }|null;
 *   event?: { name?: string }|null;
 *   summary?: DocSummary;
 *   payments?: DocPayment[];
 * }} data
 */
export function renderContractDocument(data) {
	const summary = data.summary ?? { total: 0, paid: 0, balance: 0, settled: false };

	// Los anulados no se imprimen: no forman parte del acuerdo económico.
	const payments = (data.payments ?? []).filter((payment) => payment.status !== 'anulado');

	const paymentRows = payments
		.map(
			(payment) => `<tr>
        <td>${escapeHtml(formatDate(payment.date))}</td>
        <td>${escapeHtml(payment.method || '—')}</td>
        <td>${escapeHtml(payment.reference || '—')}</td>
        <td>${escapeHtml(payment.status || '—')}</td>
        <td>${fmt(payment.amount ?? 0)}</td>
      </tr>`
		)
		.join('');

	const bodyHtml = `
    <section class="doc-section">
      <div class="doc-grid">
        <div><strong>Cliente</strong>${escapeHtml(data.customer?.name || data.contract.client_name || '—')}</div>
        <div><strong>Evento</strong>${escapeHtml(data.event?.name || data.contract.event_name || '—')}</div>
        <div><strong>Estado</strong>${escapeHtml(data.contract.status || '—')}</div>
        <div><strong>Cotización</strong>${escapeHtml(data.contract.quote_number || '—')}</div>
      </div>
    </section>

    ${
			data.contract.terms
				? `<section class="doc-section">
      <h2>Términos y condiciones</h2>
      <div class="doc-terms">${escapeHtml(data.contract.terms).replace(/\n/g, '<br />')}</div>
    </section>`
				: ''
		}

    <section class="doc-section">
      <h2>Estado de cuenta</h2>
      <div class="doc-totals">
        <div><span>Total acordado</span><span>${fmt(summary.total)}</span></div>
        <div><span>Cobrado</span><span>${fmt(summary.paid)}</span></div>
        <div class="total">
          <span>Saldo</span>
          <span>${summary.settled ? 'Saldado' : fmt(summary.balance)}</span>
        </div>
      </div>
    </section>

    ${
			payments.length
				? `<section class="doc-section">
      <h2>Pagos recibidos</h2>
      <table class="doc-table">
        <thead><tr><th>Fecha</th><th>Método</th><th>Referencia</th><th>Estado</th><th>Importe</th></tr></thead>
        <tbody>${paymentRows}</tbody>
      </table>
    </section>`
				: ''
		}

    <section class="doc-section doc-signatures">
      <div><span class="doc-signature-line"></span>Por la empresa</div>
      <div><span class="doc-signature-line"></span>Por el cliente</div>
    </section>

    ${data.contract.notes ? `<div class="doc-notes"><strong>Notas:</strong> ${escapeHtml(data.contract.notes)}</div>` : ''}
  `;

	return renderBaseDocument({
		title: `Contrato ${data.contract.number || data.contract.id}`,
		company: data.company,
		meta: [
			{ label: 'Número', value: data.contract.number || String(data.contract.id) },
			{ label: 'Fecha', value: formatDate(data.contract.date) }
		],
		bodyHtml
	});
}
