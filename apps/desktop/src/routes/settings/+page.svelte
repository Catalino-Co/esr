<script>
  import { onMount } from 'svelte';
  import { ICONS } from '@esr/ui/icons';
  import { theme } from '$lib/stores/theme.js';

  const themeOptions = [
    { value: 'light', label: 'Claro', icon: ICONS.themeLight },
    { value: 'dark', label: 'Oscuro', icon: ICONS.themeDark }
  ];

  const appearanceKey = 'esr_appearance_size';
  const appearanceOptions = [
    { value: 'auto', label: 'Automático', detail: 'Ajusta según la escala del sistema' },
    { value: 'normal', label: 'Normal', detail: 'Tamaño estándar' },
    { value: 'compact', label: 'Compacto', detail: 'Más espacio útil en pantalla' },
    { value: 'comfortable', label: 'Cómodo', detail: 'Texto ligeramente mayor' }
  ];

  let appearanceSize = 'auto';
  let displayScale = '100%';

  function saveAppearance(value) {
    appearanceSize = value;
    localStorage.setItem(appearanceKey, value);
    window.dispatchEvent(new CustomEvent('esr:appearance-changed'));
  }

  onMount(() => {
    appearanceSize = localStorage.getItem(appearanceKey) || 'auto';
    displayScale = `${Math.round((window.devicePixelRatio || 1) * 100)}%`;
  });

  // Menú principal de ajustes
  const settingModules = [
    {
      title: 'Generales',
      description: 'Valores que la aplicación propone al trabajar, como el impuesto por defecto de las líneas de cotización.',
      icon: '⚙️',
      path: '/settings/general',
      color: '#64748b' // pizarra
    },
    {
      title: 'Datos de la Empresa',
      description: 'Configurar el nombre, logo, RNC y datos de contacto para los PDFs.',
      icon: '🏢',
      path: '/settings/company',
      color: '#0ea5e9' // sky azulado
    },
    {
      title: 'Usuarios del Sistema',
      description: 'Gestión de accesos, contraseñas y roles administrativos.',
      icon: '🔐',
      path: '/settings/users',
      color: '#435ebe'
    },
    {
      title: 'Tipos de Eventos',
      description: 'Configurar los tipos de eventos disponibles en el cotizador y agendas.',
      icon: '🏷️',
      path: '/settings/event-types',
      color: '#20c997'
    },
    {
      title: 'Equipo / Colaboradores',
      description: 'Gestión del staff técnico, comercial, choferes y despachadores.',
      icon: '👷',
      path: '/settings/collaborators',
      color: '#f59e0b'
    },
    {
      title: 'Almacenes',
      description: 'Dónde está físicamente la mercancía. El inventario se ve por almacén.',
      icon: '🏬',
      path: '/settings/warehouses',
      color: '#0891b2'
    },
    {
      title: 'Unidades de Medida',
      description: 'Cómo se cuenta cada artículo: unidad, juego, metro, caja…',
      icon: '📏',
      path: '/settings/units',
      color: '#7c3aed'
    },
    {
      title: 'Categorías de Inventario',
      description: 'Gestión de categorías y subcategorías para organizar los artículos y equipos.',
      icon: '📁',
      path: '/settings/categories',
      color: '#e83e8c'
    },
    {
      title: 'Sectores Comerciales',
      description: 'A qué se dedica el cliente. Campo opcional de su ficha, útil para segmentar la cartera.',
      icon: '🏭',
      path: '/settings/sectors',
      color: '#0d9488'
    },
    {
      title: 'Tipos de Dirección',
      description: 'Clasifican las direcciones de servicio del cliente: sucursal, almacén, obra…',
      icon: '📍',
      path: '/settings/address-types',
      color: '#d97706'
    },
    {
      title: 'Agenda de Suplidores',
      description: 'Directorio de empresas de transporte, personal de apoyo y otros servicios subcontratados.',
      icon: '🤝',
      path: '/settings/suppliers',
      color: '#8b5cf6'
    }
  ];
</script>

<div class="card">
  <div class="card-title">
    <span>Configuración del Sistema</span>
  </div>

  <div class="appearance-panel">
    <div>
      <div class="appearance-title">Apariencia</div>
      <div class="appearance-meta">Escala detectada: {displayScale}</div>
    </div>

    <div class="appearance-options" role="group" aria-label="Tamaño de interfaz">
      {#each appearanceOptions as option}
        <button
          type="button"
          class="appearance-option"
          class:active={appearanceSize === option.value}
          on:click={() => saveAppearance(option.value)}
        >
          <span>{option.label}</span>
          <small>{option.detail}</small>
        </button>
      {/each}
    </div>
  </div>

  <div class="appearance-panel">
    <div>
      <div class="appearance-title">Tema visual</div>
      <div class="appearance-meta">Se recuerda en este equipo</div>
    </div>

    <div class="appearance-options" role="group" aria-label="Tema visual">
      {#each themeOptions as option}
        <button
          type="button"
          class="appearance-option"
          class:active={$theme === option.value}
          aria-pressed={$theme === option.value}
          on:click={() => theme.set(option.value)}
        >
          <span>{option.icon} {option.label}</span>
          <small>{option.value === 'light' ? 'Fondo claro' : 'Fondo oscuro'}</small>
        </button>
      {/each}
    </div>
  </div>

  <div class="settings-grid">
    {#each settingModules as mod}
      <a href={mod.path} class="settings-card" style="--accent: {mod.color};">
        <div class="icon-circle" style="background: {mod.color}20; color: {mod.color};">
          {mod.icon}
        </div>
        <div class="content">
          <h3>{mod.title}</h3>
          <p>{mod.description}</p>
        </div>
      </a>
    {/each}
  </div>
</div>

<style>
  .appearance-panel {
    display: grid;
    grid-template-columns: minmax(180px, 0.45fr) minmax(0, 1fr);
    gap: 18px;
    align-items: center;
    padding: 16px;
    margin-bottom: 22px;
    background: var(--bg-color);
    border: 1px solid var(--border-color);
    border-radius: 8px;
  }

  .appearance-title {
    font-weight: 700;
    color: var(--text-main);
    margin-bottom: 2px;
  }

  .appearance-meta {
    color: var(--text-muted);
    font-size: 0.82rem;
  }

  .appearance-options {
    display: grid;
    grid-template-columns: repeat(4, minmax(120px, 1fr));
    gap: 8px;
  }

  .appearance-option {
    text-align: left;
    padding: 10px 12px;
    background: #fff;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    cursor: pointer;
    color: var(--text-main);
    transition: all 0.15s ease;
  }

  .appearance-option:hover {
    border-color: rgba(67,94,190,.45);
    transform: translateY(-1px);
  }

  .appearance-option.active {
    border-color: var(--primary);
    box-shadow: 0 0 0 2px rgba(67,94,190,.12);
    background: rgba(67,94,190,.04);
  }

  .appearance-option span {
    display: block;
    font-weight: 700;
    font-size: 0.88rem;
  }

  .appearance-option small {
    display: block;
    margin-top: 2px;
    color: var(--text-muted);
    font-size: 0.74rem;
    line-height: 1.25;
  }

  .settings-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 20px;
    margin-top: 10px;
  }

  .settings-card {
    display: flex;
    align-items: center;
    gap: 15px;
    padding: 20px;
    background: var(--bg-color);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    text-decoration: none;
    color: var(--text-main);
    transition: all 0.2s ease;
    cursor: pointer;
  }

  .settings-card:hover {
    transform: translateY(-3px);
    box-shadow: 0 5px 15px rgba(0,0,0,0.05);
    border-color: var(--accent);
  }

  .icon-circle {
    width: 50px;
    height: 50px;
    border-radius: 50%;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 1.5rem;
    flex-shrink: 0;
  }

  .content h3 {
    margin: 0 0 5px 0;
    font-size: 1.1rem;
    font-weight: 600;
  }

  .content p {
    margin: 0;
    font-size: 0.85rem;
    color: var(--text-muted);
    line-height: 1.4;
  }

  @media (max-width: 1100px) {
    .appearance-panel {
      grid-template-columns: 1fr;
    }

    .appearance-options {
      grid-template-columns: repeat(2, minmax(140px, 1fr));
    }
  }
</style>
