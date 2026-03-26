<script>
  import '../app.css';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  const menuItems = [
    { name: 'Dashboard', path: '/', icon: '📊' },
    { name: 'Clientes', path: '/clients', icon: '👥' },
    { name: 'Eventos', path: '/events', icon: '📅' },
    { name: 'Inventario', path: '/items', icon: '📦' },
    { name: 'Paquetes', path: '/packages', icon: '🎁' },
    { name: 'Cotizaciones', path: '/quotations', icon: '📄' },
    { name: 'Órdenes de Trabajo', path: '/work_orders', icon: '🚚' },
    { name: 'Conduces', path: '/conduces', icon: '🧾' },
    { name: 'Incidencias', path: '/incidents', icon: '⚠️' },
    { name: 'Reportes', path: '/reports', icon: '📈' },
    { name: 'Ajustes', path: '/settings', icon: '⚙️' }
  ];

  let user = null;
  let isAuthChecked = false;

  onMount(() => {
    // Check auth synchronously on client
    const session = sessionStorage.getItem('esr_user');
    if (session) {
      user = JSON.parse(session);
    }
    
    if (!user && $page.url.pathname !== '/login') {
      goto('/login', { replaceState: true });
    } else if (user && $page.url.pathname === '/login') {
      goto('/', { replaceState: true });
    }
    
    isAuthChecked = true;
  });

  function handleLogout() {
    if (confirm("¿Estás seguro que deseas cerrar sesión?")) {
      sessionStorage.removeItem('esr_user');
      user = null;
      goto('/login', { replaceState: true });
    }
  }
</script>

{#if !isAuthChecked}
  <div style="display: flex; justify-content: center; align-items: center; height: 100vh; background: #f3f4f6;">
    <p>Cargando aplicación...</p>
  </div>
{:else if $page.url.pathname === '/login'}
  <slot />
{:else}
  <div class="app-container">
    <!-- Sidebar -->
    <aside class="sidebar">
      <div class="sidebar-header">
        🏢 ESR APP
      </div>
      
      {#if user}
      <div style="padding: 15px 20px; border-bottom: 1px solid rgba(255,255,255,0.1); margin-bottom: 10px;">
        <div style="font-size: 0.8rem; color: #a0aec0; text-transform: uppercase;">Sesión Iniciada</div>
        <div style="font-weight: 600; color: white;">{user.name || user.username}</div>
      </div>
      {/if}

      <nav class="sidebar-nav">
        {#each menuItems as item}
          <a href={item.path} class="nav-item {$page.url.pathname === item.path ? 'active' : ''}">
            <span class="nav-icon">{item.icon}</span>
            {item.name}
          </a>
        {/each}
      </nav>
      
      <div style="padding: 20px; margin-top: auto;">
        <button on:click={handleLogout} style="width: 100%; padding: 10px; background: rgba(220, 53, 69, 0.1); color: #fca5a5; border: 1px solid rgba(220, 53, 69, 0.3); border-radius: 6px; cursor: pointer; font-weight: 600; transition: all 0.2s;">
          🚪 Cerrar Sesión
        </button>
      </div>
    </aside>

    <!-- Main Content Area -->
    <main class="main-wrapper">
      <header class="header" style="justify-content: space-between;">
        <div class="header-title">
          {menuItems.find(m => m.path === $page.url.pathname)?.name || 'Control Operativo'}
        </div>
        <div>
          {#if user}
            <span style="background: rgba(67, 94, 190, 0.1); color: var(--primary); padding: 5px 12px; border-radius: 20px; font-weight: 600; font-size: 0.85rem;">
              Admin Mode
            </span>
          {/if}
        </div>
      </header>

      <div class="content-area">
        <slot />
      </div>
    </main>
  </div>
{/if}
