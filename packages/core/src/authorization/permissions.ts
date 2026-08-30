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
	'customers.archive',

	// Inventario
	'inventory.view',
	'inventory.create',
	'inventory.update',
	'inventory.archive',

	// Paquetes
	'packages.view',
	'packages.create',
	'packages.update',
	'packages.archive',

	// Eventos
	'events.view',
	'events.create',
	'events.update',
	'events.cancel',
	'events.archive',

	// Cotizaciones
	'quotes.view',
	'quotes.create',
	'quotes.update',
	'quotes.approve',
	'quotes.cancel',
	'quotes.convert',
	'quotes.archive',

	// Ordenes de trabajo
	'work_orders.view',
	'work_orders.create',
	'work_orders.prepare',
	'work_orders.cancel',
	'work_orders.close',
	'work_orders.archive',

	// Operacion
	'operations.deliver',
	'operations.return',
	'checklists.save',
	'conduces.view',
	'conduces.cancel',
	'conduces.archive',

	// Facturacion. La factura es el documento de dinero: cubre una o varias
	// entregas y es de donde cuelgan los cobros.
	'invoices.view',
	'invoices.create',
	'invoices.cancel',
	'invoices.archive',
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
 * Nombre legible de cada permiso. La matriz solo guarda el string tecnico
 * (`quotes.approve`), que no se puede enseñar a un usuario. El diccionario vive
 * aqui, pegado a la lista, para que un permiso nuevo sin etiqueta se note.
 */
export const PERMISSION_LABELS: Record<Permission, string> = {
	'customers.view': 'Ver clientes',
	'customers.create': 'Crear clientes',
	'customers.update': 'Editar clientes',
	'customers.archive': 'Archivar clientes',

	'inventory.view': 'Ver inventario',
	'inventory.create': 'Crear articulos',
	'inventory.update': 'Editar articulos y seriales',
	'inventory.archive': 'Archivar articulos',

	'packages.view': 'Ver paquetes',
	'packages.create': 'Crear paquetes',
	'packages.update': 'Editar paquetes',
	'packages.archive': 'Archivar paquetes',

	'events.view': 'Ver eventos',
	'events.create': 'Crear eventos',
	'events.update': 'Editar eventos',
	'events.cancel': 'Cancelar eventos',
	'events.archive': 'Archivar eventos',

	'quotes.view': 'Ver cotizaciones',
	'quotes.create': 'Crear cotizaciones',
	'quotes.update': 'Editar cotizaciones',
	'quotes.approve': 'Aprobar cotizaciones',
	'quotes.cancel': 'Cancelar cotizaciones',
	'quotes.convert': 'Convertir en orden de trabajo',
	'quotes.archive': 'Archivar cotizaciones',

	'work_orders.view': 'Ver ordenes',
	'work_orders.create': 'Crear ordenes sin cotizacion',
	'work_orders.prepare': 'Preparar ordenes',
	'work_orders.cancel': 'Cancelar ordenes',
	'work_orders.close': 'Cerrar ordenes',
	'work_orders.archive': 'Archivar ordenes',

	'operations.deliver': 'Registrar entregas',
	'operations.return': 'Registrar devoluciones',
	'checklists.save': 'Guardar checklists',
	'conduces.view': 'Ver conduces',
	'conduces.cancel': 'Anular conduces',
	'conduces.archive': 'Archivar conduces',

	'invoices.view': 'Ver facturas',
	'invoices.create': 'Emitir facturas',
	'invoices.cancel': 'Anular facturas',
	'invoices.archive': 'Archivar facturas',
	'payments.register': 'Registrar cobros',
	'payments.void': 'Anular cobros',

	'incidents.view': 'Ver incidencias',
	'incidents.create': 'Crear incidencias',
	'incidents.resolve': 'Resolver incidencias',

	'reports.view': 'Ver reportes',
	'audit.view': 'Ver auditoria',

	'settings.view': 'Abrir Configuracion',
	'settings.company.update': 'Editar datos de la empresa',
	'settings.catalogs.manage': 'Gestionar catalogos',
	'settings.members.manage': 'Gestionar usuarios'
};

/** Los permisos agrupados por modulo, en el orden en que se muestran. */
export const PERMISSION_GROUPS: Array<{ label: string; permissions: Permission[] }> = [
	{
		label: 'Clientes',
		permissions: ['customers.view', 'customers.create', 'customers.update', 'customers.archive']
	},
	{
		label: 'Inventario',
		permissions: [
			'inventory.view',
			'inventory.create',
			'inventory.update',
			'inventory.archive',
			'packages.view',
			'packages.create',
			'packages.update',
			'packages.archive'
		]
	},
	{
		label: 'Eventos',
		permissions: ['events.view', 'events.create', 'events.update', 'events.cancel', 'events.archive']
	},
	{
		label: 'Cotizaciones',
		permissions: [
			'quotes.view',
			'quotes.create',
			'quotes.update',
			'quotes.approve',
			'quotes.cancel',
			'quotes.convert',
			'quotes.archive'
		]
	},
	{
		label: 'Ordenes y operacion',
		permissions: [
			'work_orders.view',
			'work_orders.create',
			'work_orders.prepare',
			'work_orders.cancel',
			'work_orders.close',
			'work_orders.archive',
			'operations.deliver',
			'operations.return',
			'checklists.save',
			'conduces.view',
			'conduces.cancel',
			'conduces.archive'
		]
	},
	{
		label: 'Facturacion',
		permissions: [
			'invoices.view',
			'invoices.create',
			'invoices.cancel',
			'invoices.archive',
			'payments.register',
			'payments.void'
		]
	},
	{
		label: 'Incidencias',
		permissions: ['incidents.view', 'incidents.create', 'incidents.resolve']
	},
	{
		label: 'Analisis',
		permissions: ['reports.view', 'audit.view']
	},
	{
		label: 'Configuracion',
		permissions: [
			'settings.view',
			'settings.company.update',
			'settings.catalogs.manage',
			'settings.members.manage'
		]
	}
];

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
	'packages.view',
	'events.view',
	'quotes.view',
	'work_orders.view',
	'conduces.view',
	'invoices.view',
	'incidents.view',
	'reports.view'
];

const STAFF_PERMISSIONS: Permission[] = [
	...VIEWER_PERMISSIONS,
	'customers.create',
	'customers.update',
	'inventory.create',
	'inventory.update',
	// Los seriales son una propiedad del articulo: se gobiernan con inventory.*
	'packages.create',
	'packages.update',
	'events.create',
	'events.update',
	'quotes.create',
	'quotes.update',
	// Crear la orden a pelo es operacion diaria: la reserva de stock la
	// gobierna la disponibilidad, no el permiso.
	'work_orders.create',
	'work_orders.prepare',
	'operations.deliver',
	'operations.return',
	'checklists.save',
	// Emitir la factura de una entrega ya hecha es operacion diaria; anularla no.
	'invoices.create',
	'payments.register',
	'incidents.create'
];

const MANAGER_PERMISSIONS: Permission[] = [
	...STAFF_PERMISSIONS,
	// Archivar retira un registro de circulacion; no borra nada.
	'customers.archive',
	'inventory.archive',
	'packages.archive',
	'events.cancel',
	'events.archive',
	'quotes.archive',
	'work_orders.archive',
	// Anular un conduce puede deshacer una entrega entera: no es operacion diaria.
	'conduces.cancel',
	'conduces.archive',
	'quotes.approve',
	'quotes.cancel',
	'quotes.convert',
	'work_orders.cancel',
	'work_orders.close',
	'incidents.resolve',
	// Anular factura o pago mueve dinero ya registrado: se reserva a gerencia.
	'invoices.cancel',
	'invoices.archive',
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
