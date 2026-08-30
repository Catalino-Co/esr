const PRINT_STYLES = `
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, sans-serif; color: #0f172a; background: #f5f7fb; }
  .print-document { max-width: 900px; margin: 24px auto; background: #fff; border: 1px solid #dbe3ef; border-radius: 8px; padding: 32px; }
  .doc-header { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 28px; padding-bottom: 20px; border-bottom: 2px solid #eef2fb; }
  .doc-company strong { display: block; font-size: 1.25rem; margin-bottom: 6px; }
  .doc-company p { margin: 2px 0; font-size: 0.85rem; color: #64748b; }
  .doc-meta { text-align: right; }
  .doc-meta h1 { margin: 0 0 8px; font-size: 1.4rem; color: #3f5bd5; }
  .doc-meta p { margin: 2px 0; font-size: 0.88rem; color: #64748b; }
  .doc-section { margin-bottom: 20px; }
  .doc-section h2 { margin: 0 0 10px; font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; }
  .doc-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 24px; }
  .doc-grid div { font-size: 0.92rem; }
  .doc-grid strong { display: block; color: #64748b; font-size: 0.75rem; text-transform: uppercase; margin-bottom: 2px; }
  table.doc-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; margin-top: 8px; }
  table.doc-table th, table.doc-table td { border: 1px solid #e2e8f0; padding: 8px 10px; text-align: left; }
  table.doc-table th { background: #f8fafc; font-size: 0.78rem; text-transform: uppercase; color: #64748b; }
  .doc-totals { margin-top: 16px; margin-left: auto; width: min(100%, 280px); }
  .doc-totals div { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #eef2fb; }
  .doc-totals .total { font-weight: 700; font-size: 1.05rem; border-bottom: none; padding-top: 10px; }
  .doc-notes { margin-top: 20px; padding: 12px; background: #f8fafc; border-radius: 6px; font-size: 0.9rem; }
  .doc-footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #eef2fb; font-size: 0.78rem; color: #94a3b8; text-align: center; }
  .signature-box { margin-top: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
  .signature-line { border-top: 1px solid #cbd5e1; padding-top: 8px; font-size: 0.85rem; color: #64748b; }
  @media print {
    body { background: white; }
    .no-print { display: none !important; }
    .print-document { box-shadow: none; border: none; margin: 0; max-width: none; border-radius: 0; }
  }
</style>
`;

/**
 * Datos de empresa que encabezan todo documento. Salen de `company_info`, cuyas
 * columnas admiten NULL: por eso los opcionales son `string|null` y no solo
 * `string|undefined`.
 *
 * Vive aqui, y no en cada documento, porque los cuatro lo comparten y
 * declararlo por duplicado choca al reexportarlos desde index.js.
 *
 * @typedef {{ name: string, rnc?: string|null, phone?: string|null, email?: string|null, address?: string|null }} DocCompany
 */

/**
 * @param {{ title: string; company: DocCompany; meta?: Array<{ label: string; value: string }>; bodyHtml: string; footer?: string }} input
 */
export function renderBaseDocument(input) {
	const companyLines = [
		input.company.address,
		input.company.phone,
		input.company.email,
		input.company.rnc ? `RNC: ${input.company.rnc}` : null
	]
		.filter(Boolean)
		.map((line) => `<p>${escapeHtml(line)}</p>`)
		.join('');

	const metaHtml = (input.meta ?? [])
		.map((row) => `<p><strong>${escapeHtml(row.label)}:</strong> ${escapeHtml(row.value)}</p>`)
		.join('');

	return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(input.title)}</title>
  ${PRINT_STYLES}
</head>
<body>
  <div class="print-document">
    <header class="doc-header">
      <div class="doc-company">
        <strong>${escapeHtml(input.company.name)}</strong>
        ${companyLines}
      </div>
      <div class="doc-meta">
        <h1>${escapeHtml(input.title)}</h1>
        ${metaHtml}
      </div>
    </header>
    ${input.bodyHtml}
    <footer class="doc-footer">${escapeHtml(input.footer ?? 'Documento generado por ESR Cloud')}</footer>
  </div>
</body>
</html>`;
}

export function escapeHtml(value) {
	return String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}
