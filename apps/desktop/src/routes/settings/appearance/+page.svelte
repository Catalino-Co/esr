<script>
  import { onMount } from 'svelte';
  import { Icon } from '@esr/ui';
  import { ICONS } from '@esr/ui/icons';
  import { theme } from '$lib/stores/theme.js';

  /**
   * Configuración › Apariencia.
   *
   * Antes vivía embebida arriba de la portada de Configuración; se separa a
   * su propia página para quedar igual que `(app)/settings/appearance` en
   * ESR Cloud. La diferencia real entre las dos apps es el tamaño de
   * interfaz: Cloud corre en un navegador que ya trae su propio zoom, así
   * que ese control es solo de Desktop.
   */

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
</script>

<div class="herramientas">
  <div class="grupo">
    <a class="grupo-btn" href="/settings" aria-label="Volver a Configuración" title="Volver a Configuración">
      <Icon name="back" size={18} />
    </a>
  </div>
</div>

<div class="record-header">
  <div class="record-titulo">
    <h1>Apariencia</h1>
  </div>
</div>

<section class="card">
  <p class="panel-hint">Elige el tema visual de la aplicación. El cambio se aplica de inmediato y se recuerda en este equipo.</p>

  <div class="theme-options">
    {#each themeOptions as option (option.value)}
      <button
        type="button"
        class="theme-option"
        class:active={$theme === option.value}
        aria-pressed={$theme === option.value}
        on:click={() => theme.set(option.value)}
      >
        <span class="theme-preview theme-preview--{option.value}">
          <span class="tp-sidebar"></span>
          <span class="tp-content">
            <span class="tp-bar"></span>
            <span class="tp-bar short"></span>
          </span>
        </span>
        <span class="theme-label">{option.icon} {option.label}</span>
        <span class="theme-state">{$theme === option.value ? 'Activo' : ' '}</span>
      </button>
    {/each}
  </div>
</section>

<section class="card">
  <p class="panel-hint">
    Tamaño de la interfaz. Escala detectada del sistema: {displayScale}.
  </p>

  <div class="size-options" role="group" aria-label="Tamaño de interfaz">
    {#each appearanceOptions as option (option.value)}
      <button
        type="button"
        class="size-option"
        class:active={appearanceSize === option.value}
        aria-pressed={appearanceSize === option.value}
        on:click={() => saveAppearance(option.value)}
      >
        <span>{option.label}</span>
        <small>{option.detail}</small>
      </button>
    {/each}
  </div>
</section>

<style>
  .record-header {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    margin-bottom: var(--sp-5);
  }

  .record-titulo {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
  }

  .record-header h1 {
    margin: 0;
    font-size: 1.6rem;
  }

  .card + .card {
    margin-top: var(--sp-4);
  }

  .theme-options {
    display: flex;
    gap: var(--sp-4);
    flex-wrap: wrap;
  }

  .theme-option {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-4);
    border: 2px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    cursor: pointer;
    transition: all var(--transition-fast);
    min-width: 140px;
  }

  .theme-option:hover {
    border-color: var(--accent-border);
    background: var(--surface-sunken);
  }

  .theme-option.active {
    border-color: var(--accent);
    background: var(--surface-sunken);
  }

  .theme-label {
    font-size: var(--font-sm);
    font-weight: 500;
    color: var(--text-primary);
  }

  .theme-state {
    font-size: var(--font-xs);
    font-weight: 600;
    color: var(--accent-active);
    min-height: 1em;
  }

  /* Miniatura del tema: se pinta con colores literales a proposito, para que
     cada tarjeta muestre SU tema y no el que esta activo. */
  .theme-preview {
    width: 96px;
    height: 60px;
    border-radius: 6px;
    overflow: hidden;
    display: flex;
    border: 1px solid var(--border);
  }

  .theme-preview--light {
    background: #f6f8fb;
  }
  .theme-preview--dark {
    background: #020617;
  }

  .tp-sidebar {
    width: 26px;
    height: 100%;
    flex-shrink: 0;
    background: #1e1b4b;
  }

  .tp-content {
    flex: 1;
    padding: 8px 6px;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .tp-bar {
    height: 7px;
    border-radius: 3px;
    display: block;
  }

  .tp-bar.short {
    width: 60%;
  }

  .theme-preview--light .tp-bar {
    background: #cbd5e1;
  }
  .theme-preview--dark .tp-bar {
    background: #334155;
  }

  .size-options {
    display: grid;
    grid-template-columns: repeat(4, minmax(140px, 1fr));
    gap: var(--sp-2);
  }

  .size-option {
    text-align: left;
    padding: var(--sp-3);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    cursor: pointer;
    color: var(--text-primary);
    transition: all var(--transition-fast);
  }

  .size-option:hover {
    border-color: var(--accent-border);
  }

  .size-option.active {
    border-color: var(--accent);
    box-shadow: var(--focus-ring);
    background: var(--surface-sunken);
  }

  .size-option span {
    display: block;
    font-weight: 600;
    font-size: var(--font-sm);
  }

  .size-option small {
    display: block;
    margin-top: 2px;
    color: var(--text-muted);
    font-size: var(--font-xs);
    line-height: 1.25;
  }

  @media (max-width: 1100px) {
    .size-options {
      grid-template-columns: repeat(2, minmax(140px, 1fr));
    }
  }
</style>
