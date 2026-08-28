import { browser } from '$app/environment';
import { writable } from 'svelte/store';

export const SIDEBAR_STORAGE_KEY = 'esr_sidebar_collapsed';

function readStored(): boolean {
	if (!browser) return false;
	try {
		return localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
	} catch {
		return false;
	}
}

function createSidebarStore() {
	// Arranca expandida siempre: el valor real se lee en `init()` tras
	// hidratar. Leerlo aqui daria un desajuste con el HTML del servidor.
	const { subscribe, set, update } = writable(false);

	function persist(collapsed: boolean): boolean {
		if (browser) {
			try {
				localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
			} catch {
				// Sin almacenamiento la preferencia dura solo esta sesion.
			}
		}
		return collapsed;
	}

	return {
		subscribe,
		set(collapsed: boolean) {
			set(persist(Boolean(collapsed)));
		},
		toggle() {
			update((collapsed) => persist(!collapsed));
		},
		init() {
			set(readStored());
		}
	};
}

export const sidebarCollapsed = createSidebarStore();
