import type { CompanyRole } from '@esr/schemas';

/**
 * Catalogo de permisos de ESR Cloud.
 *
 * Un permiso describe una accion de negocio, no una ruta ni un componente.
 * La matriz es pura: no depende de PostgreSQL, SvelteKit ni del navegador.
 */
export const PERMISSIONS = [
	// Clientes
	'customers.view',
	'customers.create',
	'customers.update',
	'customers.deactivate',

	// Inventario
	'inventory.view',
	'inventory.create',
	'inventory.update',
	'inventory.deactivate',

	// Eventos
	'events.view',
	'events.create',
	'events.update',
	'events.cancel',
	'events.deactivate',

	// Cotizaciones
	'quotes.view',
	'quotes.create',
	'quotes.update',
	'quotes.approve',
	'quotes.cancel',
	'quotes.convert',

	// Ordenes de trabajo
	'work_orders.view',
	'work_orders.prepare',
	'work_orders.cancel',
	'work_orders.close',

	// Operacion
	'operations.deliver',
	'operations.return',
	'checklists.save',
	'conduces.view',

	// Contratos
	'contracts.view',
	'contracts.create',
	'contracts.update',
	'contracts.sign',
	'contracts.cancel',

	// Pagos
	'payments.view',
	'payments.register',
	'payments.void',

	// Incidencias
	'incidents.view',
	'incidents.create',
	'incidents.resolve',

	// Analisis
	'reports.view',
	'audit.view',

	// Configuracion
	'settings.view',
	'settings.company.update',
	'settings.catalogs.manage',
	'settings.members.manage'
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Etiquetas en espanol de los roles almacenados en `company_members.role`.
 * Los valores tecnicos no se traducen porque viven en el CHECK de PostgreSQL.
 */
export const ROLE_LABELS: Record<CompanyRole, string> = {
	owner: 'Propietario',
	admin: 'Administrador',
	manager: 'Gerente',
	staff: 'Operador',
	viewer: 'Lector'
};

export const ROLE_DESCRIPTIONS: Record<CompanyRole, string> = {
	owner: 'Control total, incluye configuracion y miembros.',
	admin: 'Control total, incluye configuracion y miembros.',
	manager: 'Aprueba cotizaciones, cierra ordenes y resuelve incidencias.',
	staff: 'Ejecuta la operacion diaria: crea, prepara, entrega y devuelve.',
	viewer: 'Solo lectura y reportes.'
};

/** Roles asignables desde la UI, ordenados de mayor a menor alcance. */
export const ASSIGNABLE_ROLES: CompanyRole[] = ['admin', 'manager', 'staff', 'viewer'];

export const COMPANY_ROLES: CompanyRole[] = ['owner', ...ASSIGNABLE_ROLES];

const VIEWER_PERMISSIONS: Permission[] = [
	// `settings.view` solo habilita ABRIR la seccion Configuracion, cuyo
	// contenido base es Apariencia (preferencia personal del usuario). Cada
	// subseccion sensible exige su propio permiso en su `load`.
	'settings.view',
	'customers.view',
	'inventory.view',
	'events.view',
	'quotes.view',
	'work_orders.view',
	'conduces.view',
	'contracts.view',
	'payments.view',
	'incidents.view',
	'reports.view'
];

const STAFF_PERMISSIONS: Permission[] = [
	...VIEWER_PERMISSIONS,
	'customers.create',
	'customers.update',
	'inventory.create',
	'inventory.update',
	'events.create',
	'events.update',
	'quotes.create',
	'quotes.update',
	'work_orders.prepare',
	'operations.deliver',
	'operations.return',
	'checklists.save',
	'contracts.create',
	'contracts.update',
	// Registrar un cobro es operacion diaria; anularlo no.
	'payments.register',
	'incidents.create'
];

const MANAGER_PERMISSIONS: Permission[] = [
	...STAFF_PERMISSIONS,
	'customers.deactivate',
	'inventory.deactivate',
	'events.cancel',
	'events.deactivate',
	'quotes.approve',
	'quotes.cancel',
	'quotes.convert',
	'work_orders.cancel',
	'work_orders.close',
	'incidents.resolve',
	'contracts.sign',
	'contracts.cancel',
	// Anular un pago mueve dinero ya registrado: se reserva a gerencia.
	'payments.void',
	'audit.view',
	'settings.catalogs.manage'
];

const ADMIN_PERMISSIONS: Permission[] = [
	...MANAGER_PERMISSIONS,
	'settings.company.update',
	'settings.members.manage'
];

export const ROLE_PERMISSIONS: Record<CompanyRole, readonly Permission[]> = {
	owner: ADMIN_PERMISSIONS,
	admin: ADMIN_PERMISSIONS,
	manager: MANAGER_PERMISSIONS,
	staff: STAFF_PERMISSIONS,
	viewer: VIEWER_PERMISSIONS
};

export function isCompanyRole(role: unknown): role is CompanyRole {
	return typeof role === 'string' && role in ROLE_PERMISSIONS;
}

/** Permisos efectivos de un rol. Un rol desconocido no obtiene ninguno. */
export function permissionsForRole(role: string | null | undefined): Permission[] {
	if (!isCompanyRole(role)) return [];
	return [...ROLE_PERMISSIONS[role]];
}

/** Regla central de autorizacion: `role` puede ejecutar `permission`. */
export function can(role: string | null | undefined, permission: Permission): boolean {
	if (!isCompanyRole(role)) return false;
	return ROLE_PERMISSIONS[role].includes(permission);
}

/** Variante para listas de permisos ya resueltas (por ejemplo en el cliente). */
export function hasPermission(
	granted: readonly string[] | null | undefined,
	permission: Permission
): boolean {
	return Boolean(granted?.includes(permission));
}

export function roleLabel(role: string | null | undefined): string {
	return isCompanyRole(role) ? ROLE_LABELS[role] : '—';
}

/**
 * `owner` y `admin` comparten permisos, pero solo `owner` es intocable:
 * ningun admin puede degradarlo ni eliminarlo.
 */
export function isOwnerRole(role: string | null | undefined): boolean {
	return role === 'owner';
}
