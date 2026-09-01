<script>
  import '@esr/config/theme.css';
  import '../app.css';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import Sidebar from '$lib/components/layout/Sidebar.svelte';
  import Topbar from '$lib/components/layout/Topbar.svelte';
  import { theme } from '$lib/stores/theme.js';
  import { salir, sesion } from '$lib/stores/session.js';

  /* La sesion vive en un store, no en una variable leida una sola vez: el login
     navega con `goto()` y este layout NO se vuelve a montar. Ver session.js. */
  $: user = $sesion;
  let isAuthChecked    = false;
  let sidebarCollapsed = false;

  const appearanceKey = 'esr_appearance_size';

  // OJO: estos umbrales estan duplicados en el script inline de `app.html`,
  // que los aplica antes del primer paint para evitar el parpadeo. Si se
  // cambian aqui, hay que cambiarlos alli tambien.
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
    theme.init();
    window.addEventListener('resize', applyAppearance);
    window.addEventListener('esr:appearance-changed', applyAppearance);

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
      salir();
      goto('/login', { replaceState: true });
    }
  }

</script>

{#if !isAuthChecked}
  <div class="boot-screen">
    <p>Cargando aplicación...</p>
  </div>
{:else if $page.url.pathname === '/login'}
  <slot />
{:else}
  <div class="app-container">
    <Sidebar
      pathname={$page.url.pathname}
      collapsed={sidebarCollapsed}
      {user}
      onToggle={toggleSidebar}
      onLogout={handleLogout}
    />

    <main class="main-wrapper">
      <Topbar pathname={$page.url.pathname} />
      <div class="content-area">
        <slot />
      </div>
    </main>
  </div>
{/if}

<style>
  .boot-screen {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
    background: var(--bg-base);
    color: var(--text-primary);
  }
</style>
