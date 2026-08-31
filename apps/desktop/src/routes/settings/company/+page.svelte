<script>
  import { onMount } from 'svelte';
  import { validateCompanySettingsInput } from '@esr/schemas';
  import { BackLink } from '@esr/ui';

  let currentCompany = {
    id: 1,
    name: '',
    rnc: '',
    phone: '',
    email: '',
    address: '',
    logo_base64: ''
  };

  let saving = false;

  async function loadData() {
    if (window.api?.settings) {
      const data = await window.api.settings.getCompany();
      if (data) currentCompany = data;
    }
  }

  onMount(() => {
    loadData();
  });

  async function saveCompanyInfo() {
    if (!validateCompanySettingsInput(currentCompany).valid) {
      alert("El nombre de la empresa es obligatorio.");
      return;
    }
    saving = true;
    try {
      currentCompany = await window.api.settings.updateCompany(currentCompany);
      alert("Configuración de empresa guardada con éxito.");
    } catch(err) {
      alert("Hubo un error al guardar: " + err);
    }
    saving = false;
  }

  function handleLogoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate size (2MB = 2 * 1024 * 1024 bytes)
    if (file.size > 2 * 1024 * 1024) {
      alert("El archivo excede el tamaño máximo de 2MB permitidos.");
      event.target.value = null;
      return;
    }

    // Validate type
    if (!['image/jpeg', 'image/png', 'image/jpg'].includes(file.type)) {
      alert("Por favor suba una imagen válida (PNG, JPG o JPEG).");
      event.target.value = null;
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      currentCompany.logo_base64 = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function removeLogo() {
    currentCompany.logo_base64 = "";
    // also clear the input if needed, but since it's hidden and bound via change, it's fine.
  }
</script>

<div class="card" style="max-width: 800px;">
  <div class="card-title" style="display: flex; align-items: center; gap: 10px;">
    <BackLink href="/settings" label="Volver a Ajustes" />
    <span>Datos de la Empresa</span>
  </div>

  <div class="split-layout">
    <!-- Formulario Izquierda -->
    <div style="flex: 2; display: flex; flex-direction: column; gap: 15px;">
      <div>
        <label for="comp-name">Nombre de la Empresa Comercial *</label>
        <input id="comp-name" type="text" bind:value={currentCompany.name} class="form-control" placeholder="Ej. Eventos Mágicos SRL">
      </div>
      <div>
        <label for="comp-rnc">RNC / Cédula / Identificador Fiscal</label>
        <input id="comp-rnc" type="text" bind:value={currentCompany.rnc} class="form-control" placeholder="Ej. 130299441">
      </div>
      <div style="display: flex; gap: 15px;">
        <div style="flex: 1;">
          <label for="comp-phone">Teléfono (WhatsApp)</label>
          <input id="comp-phone" type="text" bind:value={currentCompany.phone} class="form-control" placeholder="Ej. 809-555-5555">
        </div>
        <div style="flex: 1;">
          <label for="comp-email">Correo Electrónico</label>
          <input id="comp-email" type="email" bind:value={currentCompany.email} class="form-control" placeholder="info@empresa.com">
        </div>
      </div>
      <div>
        <label for="comp-address">Dirección Física</label>
        <textarea id="comp-address" bind:value={currentCompany.address} class="form-control" rows="2" placeholder="Calle Ejemplo #123, Ens. Ejemplo..."></textarea>
      </div>
    </div>

    <!-- Logo Derecha -->
    <div class="logo-section" style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 15px; border-left: 1px dashed var(--border-color); padding-left: 30px;">
      <span style="font-weight: 600; font-size: 0.95rem; color: var(--text-main);">Logotipo Formal</span>
      
      <div class="logo-preview">
        {#if currentCompany.logo_base64}
          <img src={currentCompany.logo_base64} alt="Company Logo" style="max-width: 100%; max-height: 100%; object-fit: contain;">
        {:else}
          <span style="color: var(--text-muted); font-size: 2rem;">🏢</span>
          <span style="color: var(--text-muted); font-size: 0.8rem; margin-top: 10px; text-align: center;">Sin Logo</span>
        {/if}
      </div>

      <input type="file" id="logo-upload" accept="image/png, image/jpeg, image/jpg" style="display: none;" on:change={handleLogoUpload}>
      
      <div style="display: flex; gap: 10px; flex-direction: column; width: 100%;">
        <label for="logo-upload" class="btn btn-secondary" style="text-align: center; cursor: pointer; width: 100%; padding: 8px; border-radius: 4px; box-sizing: border-box;">Subir / Cambiar Logo</label>
        {#if currentCompany.logo_base64}
          <button class="btn btn-danger" on:click={removeLogo} style="padding: 8px; border-radius: 4px;">Remover Logo</button>
        {/if}
      </div>
      <span style="font-size: 0.75rem; color: var(--text-muted); text-align: center; line-height: 1.3;">Formatos: JPG, PNG. <br>MAX: 2MB.<br>Recomendado: Fondo Claro o Transparente</span>
    </div>
  </div>

  <div style="margin-top: 30px; display: flex; justify-content: flex-end; padding-top: 20px; border-top: 1px solid var(--border-color);">
    <button class="btn btn-primary" style="padding: 10px 25px; font-weight: 600; font-size: 1rem;" on:click={saveCompanyInfo} disabled={saving}>
      {saving ? 'Guardando...' : 'Guardar Configuración'}
    </button>
  </div>
</div>

<style>
  .split-layout {
    display: flex; 
    gap: 30px; 
    margin-top: 20px;
  }
  @media (max-width: 768px) {
    .split-layout {
      flex-direction: column;
    }
    .logo-section {
      border-left: none !important;
      padding-left: 0 !important;
      border-top: 1px dashed var(--border-color);
      padding-top: 20px;
    }
  }

  .form-control { width: 100%; padding: 10px 12px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); outline: none; font-size: 0.95rem; box-sizing: border-box;}
  .form-control:focus { border-color: var(--primary); }
  label { display: block; font-size: 0.85rem; font-weight: 500; color: var(--text-muted); margin-bottom: 5px; }
  
  .logo-preview {
    width: 200px;
    height: 150px;
    background-color: var(--bg-color);
    border: 2px dashed #ccc;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    padding: 10px;
    box-sizing: border-box;
  }
  .btn-danger {
    background-color: var(--danger);
    color: white;
    width: 100%;
    cursor: pointer;
    border: none;
  }
</style>
