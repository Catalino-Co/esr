/**
 * Prefijo de un SKU generado, derivado del nombre de la categoria.
 *
 * Tres letras del nombre normalizado: sin acentos (`normalize('NFD')` separa
 * la tilde como combinador, el `replace` la descarta), sin nada que no sea
 * letra, en mayusculas. Sin categoria -o si no quedan letras tras filtrar-
 * cae en `ART`, generico y corto a proposito: es solo el prefijo humano de un
 * codigo que YA es unico por el numero que le sigue, no hace falta que el
 * prefijo tambien lo sea.
 */
export function categoryToSkuPrefix(categoryName: string | null | undefined): string {
	const normalized = (categoryName ?? '')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-zA-Z]/g, '')
		.toUpperCase();
	return normalized.slice(0, 3) || 'ART';
}
