import type { Permission } from '@esr/core';
import { ICONS } from '@esr/ui/icons';

export type SettingsSection = {
	href: string;
	/** Nombre del modulo, tal como se lee en la tarjeta. */
	title: string;
	icon: string;
	description: string;
	/**
	 * Permiso minimo para ver la seccion. `null` = visible para cualquier
	 * miembro: Apariencia es una preferencia del usuario, no de la empresa.
	 */
	permission: Permission | null;
};

/**
 * Indice de Configuracion. Fuente unica: de aqui salen las tarjetas de
 * /settings y el enlace de vuelta de cada subpagina. Antes la lista estaba
 * duplicada —una en el layout para las pestañas y otra en la portada— y las
 * dos versiones ya diferian en los titulos.
 */
export const settingsSections: SettingsSection[] = [
	{
		href: '/settings/appearance',
		title: 'Apariencia',
		icon: ICONS.appearance,
		description: 'Tema claro u oscuro de la aplicación. Es una preferencia tuya, no de la empresa.',
		permission: null
	},
	{
		href: '/settings/general',
		title: 'Generales',
		icon: ICONS.settings,
		description:
			'Valores que la aplicación propone al trabajar, como el impuesto por defecto de las líneas de cotización.',
		permission: 'settings.company.update'
	},
	{
		href: '/settings/company',
		title: 'Datos de la empresa',
		icon: ICONS.company,
		description:
			'Nombre, RNC, teléfono, email y dirección que aparecen en cotizaciones, órdenes y conduces.',
		permission: 'settings.company.update'
	},
	{
		href: '/settings/categories',
		title: 'Categorías',
		icon: ICONS.categories,
		description: 'Primer nivel de clasificación del inventario.',
		permission: 'settings.catalogs.manage'
	},
	{
		href: '/settings/subcategories',
		title: 'Subcategorías',
		icon: ICONS.subcategories,
		description: 'Cuelgan de una categoría y afinan la clasificación de los artículos.',
		permission: 'settings.catalogs.manage'
	},
	{
		href: '/settings/event-types',
		title: 'Tipos de evento',
		icon: ICONS.eventTypes,
		description: 'Clasifican los eventos de la empresa y aparecen en los reportes.',
		permission: 'settings.catalogs.manage'
	},
	{
		href: '/settings/suppliers',
		title: 'Proveedores',
		icon: ICONS.suppliers,
		description: 'Empresas y personas a las que se subcontrata equipo o servicios.',
		permission: 'settings.catalogs.manage'
	},
	{
		href: '/settings/collaborators',
		title: 'Colaboradores',
		icon: ICONS.collaborators,
		description: 'Equipo que ejecuta la operación: técnicos, choferes y montaje.',
		permission: 'settings.catalogs.manage'
	},
	{
		href: '/settings/sectors',
		title: 'Sectores comerciales',
		icon: ICONS.sectors,
		description: 'A qué se dedica el cliente. Es opcional en su ficha y sirve para segmentar.',
		permission: 'settings.catalogs.manage'
	},
	{
		href: '/settings/address-types',
		title: 'Tipos de dirección',
		icon: ICONS.addressTypes,
		description: 'Clasifican las direcciones de servicio del cliente: sucursal, almacén, obra…',
		permission: 'settings.catalogs.manage'
	},
	{
		href: '/settings/users',
		title: 'Usuarios',
		icon: ICONS.members,
		description: 'Quién tiene acceso a la empresa, con qué rol, y en qué estado está cada cuenta.',
		permission: 'settings.members.manage'
	},
	{
		href: '/settings/roles',
		title: 'Roles y permisos',
		icon: ICONS.roles,
		description: 'Qué puede hacer cada rol, permiso a permiso. Es una referencia: no se edita.',
		permission: 'settings.members.manage'
	}
];

/** Las secciones que el rol actual puede abrir. */
export function visibleSettingsSections(permissions: readonly string[] = []): SettingsSection[] {
	return settingsSections.filter(
		(section) => !section.permission || permissions.includes(section.permission)
	);
}

/** La seccion a la que pertenece una ruta, o `null` en la portada. */
export function settingsSectionFor(pathname: string): SettingsSection | null {
	return settingsSections.find((section) => pathname.startsWith(section.href)) ?? null;
}
