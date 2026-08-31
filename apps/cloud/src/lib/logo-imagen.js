/**
 * Prepara el logotipo de la empresa para guardarlo.
 *
 * Solo CLIENTE: usa `canvas` y `createImageBitmap`. Por eso no vive en
 * `@esr/core` ni en `@esr/schemas` —esos corren tambien en Node, dentro de las
 * actions— ni en `$lib/server`, que es justo lo contrario.
 *
 * Que hace y por que:
 *
 * El PDF dibuja el logo a 45x20 mm. Un archivo de 2 MB son cuarenta veces mas
 * pixeles de los que esa caja puede enseñar, y ese peso no se queda quieto: se
 * guarda en `company_info`, viaja en cada lectura de la empresa y tiene que
 * caber en el cuerpo de un POST. Reescalar en el navegador lo convierte en unos
 * 60-150 KB sin que se note en el papel.
 */

/** El archivo que entra. Mismo tope que ESR Pro. */
export const MAX_ARCHIVO_BYTES = 2 * 1024 * 1024;

/**
 * Lo que llega a viajar, ya reescalado.
 *
 * Holgado bajo los 512 KB de `adapter-node`, que es el mas estrecho de los
 * destinos posibles —Vercel da 4.5 MB, Netlify 6— y `apps/cloud` todavia usa
 * `adapter-auto`, asi que el limite real no esta decidido. Se diseña contra el
 * peor de los tres.
 */
export const MAX_DATA_URL_CHARS = 300 * 1024;

/**
 * La escalera de anchos.
 *
 * Un PNG con degradados puede pasarse de peso a 600 px aunque el archivo de
 * partida fuera pequeño. Sin estos escalones, «600 px» seria una heuristica que
 * a veces falla, y cuando falla el usuario recibe un 413 sin mensaje. Con ellos,
 * el tope es una garantia.
 */
const ANCHOS = [600, 400, 300];

/** Solo estos dos. `image/jpg` NO es un tipo MIME y nunca coincide con nada. */
const TIPOS = ['image/png', 'image/jpeg'];

/**
 * @param {File} archivo
 * @returns {Promise<{ ok: true, dataUrl: string } | { ok: false, error: string }>}
 */
export async function prepararLogo(archivo) {
	if (!TIPOS.includes(archivo.type)) {
		return { ok: false, error: 'El logotipo tiene que ser un PNG o un JPG.' };
	}
	// ANTES de decodificar: un JPEG de 2 MB puede ocupar 100 MB ya descomprimido.
	if (archivo.size > MAX_ARCHIVO_BYTES) {
		return { ok: false, error: 'El archivo pasa de 2 MB. Pruebe con uno más pequeño.' };
	}

	let imagen;
	try {
		imagen = await decodificar(archivo);
	} catch {
		return { ok: false, error: 'No se pudo leer la imagen. ¿Está completa?' };
	}

	if (!imagen.width || !imagen.height) {
		return { ok: false, error: 'La imagen no tiene tamaño.' };
	}

	/*
	 * El formato de salida SIGUE al de entrada, y no se cruza nunca.
	 *
	 * Un PNG pasado a JPEG pierde la transparencia, y no sobre blanco: el
	 * codificador compone sobre NEGRO. El logo con fondo transparente —el que la
	 * propia ayuda de la pantalla recomienda— saldria en un recuadro negro en la
	 * cabecera del documento.
	 *
	 * Y al reves tampoco: `pdf-generator.js` elige el formato mirando el prefijo
	 * (`startsWith('data:image/png')`). Si la etiqueta y los bytes se separasen,
	 * jsPDF lanzaria dentro de un `catch` que solo hace `console.warn`, y el
	 * documento saldria sin logo y sin aviso.
	 */
	const tipo = archivo.type;
	const calidad = tipo === 'image/jpeg' ? 0.85 : undefined;

	try {
		for (const ancho of ANCHOS) {
			// `Math.min(1, ...)`: un logo que ya mide menos NO se agranda. Solo
			// añadiria bytes y lo emborronaria, y el papel lo enseña igual.
			const escala = Math.min(1, ancho / imagen.width);
			const w = Math.max(1, Math.round(imagen.width * escala));
			const h = Math.max(1, Math.round(imagen.height * escala));

			const dataUrl = pintar(imagen, w, h, tipo, calidad);
			// Un data URL es ASCII puro: un caracter, un byte.
			if (dataUrl.length <= MAX_DATA_URL_CHARS) return { ok: true, dataUrl };
		}
	} finally {
		// Solo un `ImageBitmap` tiene `close`, y sin el se queda reteniendo su
		// memoria hasta que pase el recolector. Un <img> del camino de respaldo
		// no lo tiene y no le hace falta.
		if ('close' in imagen) imagen.close();
	}

	return {
		ok: false,
		error: 'El logotipo sigue pesando demasiado. Pruebe con una imagen más simple o en JPG.'
	};
}

/**
 * `createImageBitmap` y no `new Image()` + object URL, por dos motivos: no deja
 * una URL que alguien tenga que acordarse de revocar, y `imageOrientation`
 * respeta el EXIF, asi que un logo fotografiado con el movil no entra girado.
 *
 * @param {File} archivo
 * @returns {Promise<ImageBitmap | HTMLImageElement>}
 */
async function decodificar(archivo) {
	if (typeof createImageBitmap === 'function') {
		return await createImageBitmap(archivo, { imageOrientation: 'from-image' });
	}

	const url = URL.createObjectURL(archivo);
	try {
		return await new Promise((resolver, rechazar) => {
			const img = new Image();
			img.onload = () => resolver(img);
			img.onerror = () => rechazar(new Error('decode'));
			img.src = url;
		});
	} finally {
		URL.revokeObjectURL(url);
	}
}

/**
 * @param {ImageBitmap | HTMLImageElement} imagen
 * @param {number} w
 * @param {number} h
 * @param {string} tipo
 * @param {number | undefined} calidad
 * @returns {string}
 */
function pintar(imagen, w, h, tipo, calidad) {
	const lienzo = document.createElement('canvas');
	lienzo.width = w;
	lienzo.height = h;
	const ctx = lienzo.getContext('2d');
	// `getContext` devuelve null si el navegador no puede dar un contexto 2d.
	// No pasa en la practica, pero un fallo aqui debe decir que fallo, no
	// reventar con «cannot read property of null» tres lineas mas abajo.
	if (!ctx) throw new Error('El navegador no pudo preparar la imagen.');
	// Sin `fillRect` previo: el lienzo se queda transparente, que es lo que
	// conserva el alfa de un PNG.
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(imagen, 0, 0, w, h);
	return calidad === undefined ? lienzo.toDataURL(tipo) : lienzo.toDataURL(tipo, calidad);
}
