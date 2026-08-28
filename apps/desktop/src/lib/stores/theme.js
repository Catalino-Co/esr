import { writable } from 'svelte/store';

/**
 * Tema visual de ESR Pro. El atributo `data-theme` ya lo deja puesto el
 * script inline de `app.html` antes del primer paint; este store solo lo
 * sincroniza y lo cambia cuando el usuario elige otro.
 */
const STORAGE_KEY = 'esr_theme';
const DEFAULT_THEME = 'light';
const VALID = ['light', 'dark'];

// Electron carga la app desde file://, donde el acceso a localStorage puede
// lanzar segun la configuracion de Chromium. Todo va envuelto en try/catch.
const browser = typeof document !== 'undefined';

function readInitial() {
	if (!browser) return DEFAULT_THEME;
	const fromDom = document.documentElement.getAttribute('data-theme');
	if (VALID.includes(fromDom)) return fromDom;
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (VALID.includes(saved)) return saved;
	} catch {
		/* sin almacenamiento: queda el default */
	}
	return DEFAULT_THEME;
}

function createThemeStore() {
	const { subscribe, set } = writable(readInitial());

	function apply(next) {
		if (!browser) return;
		const value = VALID.includes(next) ? next : DEFAULT_THEME;
		document.documentElement.setAttribute('data-theme', value);
		try {
			localStorage.setItem(STORAGE_KEY, value);
		} catch {
			/* la preferencia dura solo esta sesion */
		}
		set(value);
	}

	return {
		subscribe,
		set: apply,
		toggle() {
			apply(readInitial() === 'dark' ? 'light' : 'dark');
		},
		init() {
			apply(readInitial());
		}
	};
}

export const theme = createThemeStore();
