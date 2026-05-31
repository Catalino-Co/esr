<script>
  import '../app.css';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  const menuItems = [
    { name: 'Dashboard',          path: '/',           icon: '📊' },
    { name: 'Clientes',           path: '/clients',    icon: '👥' },
    { name: 'Eventos',            path: '/events',     icon: '📅' },
    { name: 'Inventario',         path: '/items',      icon: '📦' },
    { name: 'Paquetes',           path: '/packages',   icon: '🎁' },
    { name: 'Cotizaciones',       path: '/quotations', icon: '📄' },
    { name: 'Órdenes de Trabajo', path: '/work_orders',icon: '🚚' },
    { name: 'Conduces',           path: '/conduces',   icon: '🧾' },
    { name: 'Incidencias',        path: '/incidents',  icon: '⚠️' },
    { name: 'Reportes',           path: '/reports',    icon: '📈' },
    { name: 'Ajustes',            path: '/settings',   icon: '⚙️' }
  ];

  let user             = null;
  let isAuthChecked    = false;
  let sidebarCollapsed = false;

  const appearanceKey = 'esr_appearance_size';

  function getAppearanceScale(value = 'auto') {
    if (value === 'compact') return 0.9;
    if (value === 'normal') return 1;
    if (value === 'comfortable') return 1.06;
    if (typeof window !== 'undefined' && window.devicePixelRatio >= 1.5) return 0.9;
    if (typeof window !== 'undefined' && window.devicePixelRatio >= 1.25) return 0.96;
    return 1;
  }

  function applyAppearance() {
    const selectedSize = localStorage.getItem(appearanceKey) || 'auto';
    const scale = getAppearanceScale(selectedSize);
    const resolvedSize = scale < 0.95 ? 'compact' : scale > 1 ? 'comfortable' : 'normal';

    document.documentElement.style.setProperty('--ui-font-scale', String(scale));
    document.documentElement.dataset.uiSize = resolvedSize;
    document.documentElement.dataset.uiPreference = selectedSize;
  }

  onMount(() => {
    applyAppearance();
    window.addEventListener('resize', applyAppearance);
    window.addEventListener('esr:appearance-changed', applyAppearance);

    const session = sessionStorage.getItem('esr_user');
    if (session) user = JSON.parse(session);

    if (!user && $page.url.pathname !== '/login') {
      goto('/login', { replaceState: true });
    } else if (user && $page.url.pathname === '/login') {
      goto('/', { replaceState: true });
    }

    isAuthChecked = true;

    const saved = localStorage.getItem('sidebar_collapsed');
    if (saved === 'true') sidebarCollapsed = true;

    return () => {
      window.removeEventListener('resize', applyAppearance);
      window.removeEventListener('esr:appearance-changed', applyAppearance);
    };
  });

  function toggleSidebar() {
    sidebarCollapsed = !sidebarCollapsed;
    localStorage.setItem('sidebar_collapsed', String(sidebarCollapsed));
  }

  function handleLogout() {
    if (confirm('¿Estás seguro que deseas cerrar sesión?')) {
      sessionStorage.removeItem('esr_user');
      user = null;
      goto('/login', { replaceState: true });
    }
  }

  function isActive(itemPath) {
    if (itemPath === '/') return $page.url.pathname === '/';
    return $page.url.pathname === itemPath || $page.url.pathname.startsWith(itemPath + '/');
  }

  $: pageTitle = (() => {
    const p = $page.url.pathname;
    for (const m of menuItems) {
      if (m.path === '/' ? p === '/' : (p === m.path || p.startsWith(m.path + '/'))) return m.name;
    }
    return 'Control Operativo';
  })();
</script>

{#if !isAuthChecked}
  <div style="display:flex;justify-content:center;align-items:center;height:100vh;background:#f3f4f6;">
    <p>Cargando aplicación...</p>
  </div>
{:else if $page.url.pathname === '/login'}
  <slot />
{:else}
  <div class="app-container">

    <!-- ── Sidebar ──────────────────────────────────────────────────────── -->
    <aside class="sidebar" class:collapsed={sidebarCollapsed}>

      <!-- Header / brand -->
      <div class="sidebar-header">
        <span class="sidebar-brand">🏢 ESR Pro</span>
        <button class="sidebar-toggle" on:click={toggleSidebar}
                title={sidebarCollapsed ? 'Expandir menú' : 'Colapsar menú'}>
          {sidebarCollapsed ? '▶' : '◀'}
        </button>
      </div>

      <!-- Navigation -->
      <nav class="sidebar-nav">
        {#each menuItems as item}
          <a href={item.path}
             class="nav-item"
             class:active={isActive(item.path)}
             title={sidebarCollapsed ? item.name : ''}>
            <span class="nav-icon">{item.icon}</span>
            <span class="nav-label">{item.name}</span>
          </a>
        {/each}
      </nav>

      <!-- Logout -->
      <div class="sidebar-footer">
        <button on:click={handleLogout} class="logout-btn"
                title={sidebarCollapsed ? 'Cerrar Sesión' : ''}>
          <span>🚪</span>
          <span class="nav-label">Cerrar Sesión</span>
        </button>
      </div>
    </aside>

    <!-- ── Main content ─────────────────────────────────────────────────── -->
    <main class="main-wrapper">
      <header class="header" style="justify-content:space-between;">
        <div class="header-title">{pageTitle}</div>
        <div>
          {#if user}
            <span style="background:rgba(67,94,190,.1);color:var(--primary);padding:5px 12px;border-radius:20px;font-weight:600;font-size:.85rem;">
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
