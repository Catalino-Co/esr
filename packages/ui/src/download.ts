/**
 * Dispara la descarga de un Blob con un enlace temporal. Lo usan las DOS
 * apps para exportar (Excel, y cualquier otro archivo generado en el
 * cliente) — mismo truco que ya hace `PdfPreviewModal` con sus propios
 * blobs de PDF, sacado de ahí para no copiarlo dos veces.
 */
export function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}
