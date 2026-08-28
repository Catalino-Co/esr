import { browser } from '$app/environment';
import { writable } from 'svelte/store';

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'esr_theme';
const DEFAULT_THEME: Theme = 'light';

function readStored(): Theme {
	if (!browser) return DEFAULT_THEME;
	try {
		return localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : DEFAULT_THEME;
	} catch {
		// Algunos navegadores lanzan al leer localStorage en modo privado.
		return DEFAULT_THEME;
	}
}

function createThemeStore() {
	const { subscribe, set } = writable<Theme>(DEFAULT_THEME);

	function apply(theme: Theme) {
		if (browser) {
			document.documentElement.setAttribute('data-theme', theme);
			try {
				localStorage.setItem(THEME_STORAGE_KEY, theme);
			} catch {
				// Sin almacenamiento la preferencia dura solo esta sesion.
			}
		}
		set(theme);
	}

	return {
		subscribe,
		set: apply,
		toggle() {
			apply(readStored() === 'dark' ? 'light' : 'dark');
		},
		/**
		 * Sincroniza el store con lo que el script inline de `app.html` ya
		 * pinto en `<html>`. No vuelve a escribir el atributo: para cuando
		 * esto corre, el primer paint ya ocurrio con el tema correcto.
		 */
		init() {
			if (browser) set(readStored());
		}
	};
}

export const theme = createThemeStore();
