<script>
  import { onMount } from 'svelte';
  import { resolvePageMeta } from '$lib/navigation.js';

  /**
   * Cabecera de la aplicacion. Espejo del Topbar de Cloud: mismo marcado y
   * mismas clases, que viven en @esr/config/theme.css. Sin `<style>` propio a
   * proposito — cualquier regla local aqui iria sin capa y dejaria la version
   * compartida inerte, que es como las dos apps se separaron la primera vez.
   *
   * No lleva el boton de menu movil de Cloud: Electron no tiene ese caso.
   */
  export let pathname = '/';

  let empresa = '';

  $: meta = resolvePageMeta(pathname);

  onMount(async () => {
    // Una sola lectura por arranque. Si falla, la pildora se queda en `—`,
    // igual que en Cloud cuando no hay empresa activa.
    try {
      const fila = await window.api?.db?.getOne('SELECT name FROM company_info WHERE id = 1');
      empresa = fila?.name ?? '';
    } catch {
      empresa = '';
    }
  });
</script>

<header class="topbar">
  <div class="topbar-left">
    <div class="topbar-titles">
      <h1>{meta.title}</h1>
      <p>{meta.subtitle}</p>
    </div>
  </div>

  <div class="topbar-right">
    <span class="company-pill">{empresa || '—'}</span>
  </div>
</header>
