<script>
  // Menú principal de ajustes
  const settingModules = [
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
      title: 'Categorías de Inventario',
      description: 'Gestión de categorías y subcategorías para organizar los artículos y equipos.',
      icon: '📁',
      path: '/settings/categories',
      color: '#e83e8c'
    }
  ];
</script>

<div class="card">
  <div class="card-title">
    <span>Configuración del Sistema</span>
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
</style>
