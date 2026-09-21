<script>
  import { ICONS } from '@esr/ui/icons';

  /**
   * Portada de Configuración. Mismo grid neutro que ESR Cloud
   * (`(app)/settings/+page.svelte`): un solo acento por pantalla, así que el
   * color no vive por tarjeta sino en el borde al hover.
   *
   * Gemela de Configuración › portada en ESR Cloud, salvo que aquí no hay
   * permisos que filtrar: Desktop es de un solo usuario.
   */
  const settingModules = [
    {
      title: 'Apariencia',
      description: 'Tema claro u oscuro y tamaño de la interfaz. Son preferencias tuyas, se guardan en este equipo.',
      icon: ICONS.appearance,
      path: '/settings/appearance'
    },
    {
      title: 'Generales',
      description: 'Valores que la aplicación propone al trabajar, como el impuesto por defecto de las líneas de cotización.',
      icon: ICONS.settings,
      path: '/settings/general'
    },
    {
      title: 'Datos de la Empresa',
      description: 'Configurar el nombre, logo, RNC y datos de contacto para los PDFs.',
      icon: ICONS.company,
      path: '/settings/company'
    },
    {
      title: 'Artículos',
      description: 'El catálogo: qué artículos existen, su unidad, su proveedor y su estado. Las existencias se ven en Inventario.',
      icon: ICONS.inventory,
      path: '/settings/articles'
    },
    {
      title: 'Almacenes',
      description: 'Dónde está físicamente la mercancía. El inventario se ve por almacén.',
      icon: ICONS.inventory,
      path: '/settings/warehouses'
    },
    {
      title: 'Unidades de Medida',
      description: 'Cómo se cuenta cada artículo: unidad, juego, metro, caja…',
      icon: ICONS.subcategories,
      path: '/settings/units'
    },
    {
      title: 'Categorías de Inventario',
      description: 'Gestión de categorías y subcategorías para organizar los artículos y equipos.',
      icon: ICONS.categories,
      path: '/settings/categories'
    },
    {
      title: 'Tipos de Eventos',
      description: 'Configurar los tipos de eventos disponibles en el cotizador y agendas.',
      icon: ICONS.eventTypes,
      path: '/settings/event-types'
    },
    {
      title: 'Agenda de Suplidores',
      description: 'Directorio de empresas de transporte, personal de apoyo y otros servicios subcontratados.',
      icon: ICONS.suppliers,
      path: '/settings/suppliers'
    },
    {
      title: 'Equipo / Colaboradores',
      description: 'Gestión del staff técnico, comercial, choferes y despachadores.',
      icon: ICONS.collaborators,
      path: '/settings/collaborators'
    },
    {
      title: 'Sectores Comerciales',
      description: 'A qué se dedica el cliente. Campo opcional de su ficha, útil para segmentar la cartera.',
      icon: ICONS.sectors,
      path: '/settings/sectors'
    },
    {
      title: 'Exportar / Importar catálogos',
      description: 'Lleva tipos de evento, unidades, categorías, subcategorías y sectores a otra instalación o a ESR Cloud, o tráelos de vuelta.',
      icon: ICONS.docs,
      path: '/settings/catalogs-transfer'
    },
    {
      title: 'Tipos de Dirección',
      description: 'Clasifican las direcciones de servicio del cliente: sucursal, almacén, obra…',
      icon: ICONS.addressTypes,
      path: '/settings/address-types'
    },
    {
      title: 'Usuarios del Sistema',
      description: 'Gestión de accesos, contraseñas y roles administrativos.',
      icon: ICONS.members,
      path: '/settings/users'
    },
    {
      title: 'Roles y Permisos',
      description: 'Qué puede hacer cada rol, permiso a permiso. Es una referencia: no se edita.',
      icon: ICONS.roles,
      path: '/settings/roles'
    }
  ];
</script>

<div class="settings-cards">
  {#each settingModules as mod (mod.path)}
    <a class="settings-card" href={mod.path}>
      <span class="settings-card-icon" aria-hidden="true">{mod.icon}</span>
      <span class="settings-card-text">
        <strong>{mod.title}</strong>
        <span class="settings-card-desc">{mod.description}</span>
      </span>
    </a>
  {/each}
</div>

<style>
  /* Las tarjetas van sueltas sobre el fondo de la pagina, no dentro de un
     `.card`: un panel blanco lleno de tarjetas blancas no aporta borde
     ninguno y solo resta ancho. Igual que en ESR Cloud. */
  .settings-cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--sp-4);
  }

  .settings-card {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-3);
    padding: var(--sp-4);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
    transition:
      border-color var(--transition-fast),
      box-shadow var(--transition-fast);
  }

  .settings-card:hover {
    border-color: var(--accent);
    box-shadow: var(--shadow-md);
  }

  .settings-card:focus-visible {
    outline: none;
    border-color: var(--accent);
    box-shadow: var(--focus-ring);
  }

  /* El icono se apoya en --accent-subtle, no en --accent: el acento solido
     ya lo lleva el item activo del menu, y repetido en trece fichas dejaria
     de senalar nada. */
  .settings-card-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    border-radius: var(--radius);
    background: var(--accent-subtle);
    font-size: 1.15rem;
    line-height: 1;
  }

  .settings-card-text {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .settings-card strong {
    font-size: var(--font-md);
    color: var(--text-primary);
  }

  .settings-card-desc {
    font-size: var(--font-sm);
    color: var(--text-muted);
    line-height: 1.5;
  }
</style>
