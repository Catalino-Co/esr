export function formatDate(value) {
	if (!value) return '—';
	const text = String(value);
	return text.length >= 10 ? text.slice(0, 10) : text;
}

export function formatDateTime(value) {
	if (!value) return '—';
	const text = String(value);
	return text.replace('T', ' ').slice(0, 19);
}
