<script>
	import { enhance } from '$app/forms';
	import { prepararLogo } from '$lib/logo-imagen';

	let { data, form } = $props();

	const values = $derived(form?.values ?? data.settings);

	/* ── El logotipo ───────────────────────────────────────────────────────
	 *
	 * UNA sola pieza de estado, `pendiente`, y de ella salen las otras dos:
	 *
	 *   null  no lo he tocado   -> se enseña lo que hay guardado, y no viaja nada
	 *   ''    quiero quitarlo
	 *   ...   este es el nuevo
	 *
	 * Sale así y no con tres variables sueltas porque las tres tendrían que
	 * moverse a la vez, y en cuanto una se olvida aparecen los dos fallos de
	 * siempre: guardar y seguir enseñando la foto vieja, o subir un logotipo una
	 * vez y volver a mandarlo en cada guardado posterior. Volviendo `pendiente` a
	 * `null` tras guardar, la pantalla se rinde a lo que diga el servidor.
	 */
	let pendiente = $state(/** @type {string | null} */ (null));
	let errorLogo = $state('');
	/** @type {HTMLInputElement} */
	let campoArchivo;

	const guardado = $derived(data.settings.logo_base64 ?? '');
	const logo = $derived(pendiente === null ? guardado : pendiente);
	const accion = $derived(pendiente === null ? 'keep' : pendiente === '' ? 'clear' : 'set');

	/** @param {Event & { currentTarget: HTMLInputElement }} evento */
	async function alElegir(evento) {
		const archivo = evento.currentTarget.files?.[0];
		// Se limpia SIEMPRE, con éxito o con error: si no, volver a elegir el
		// MISMO archivo no dispara `change` y parece que la pantalla se colgó.
		evento.currentTarget.value = '';
		if (!archivo) return;

		errorLogo = '';
		const resultado = await prepararLogo(archivo);
		if (!resultado.ok) {
			errorLogo = resultado.error;
			return;
		}
		pendiente = resultado.dataUrl;
	}

	/**
	 * Tras guardar bien, la pantalla vuelve a mirar a la base de datos.
	 *
	 * `reset: false` NO es opcional: `update()` llama a `form.reset()` por
	 * defecto, y un reset devuelve cada campo a su ATRIBUTO `value`. Svelte
	 * escribe estos valores como PROPIEDAD, así que el atributo está vacío y el
	 * reset deja el formulario en blanco —con los datos intactos en la base, que
	 * es lo que hace que el fallo parezca un borrado y no lo sea—.
	 */
	const alGuardar = () => async ({ update, result }) => {
		await update({ reset: false });
		if (result.type === 'success') {
			pendiente = null;
			errorLogo = '';
		}
	};

	function quitar() {
		pendiente = '';
		errorLogo = '';
	}
</script>

<section class="panel empresa">
	<p class="panel-hint">
		Esta información encabeza las cotizaciones, órdenes, conduces y checklists imprimibles.
	</p>

	{#if form?.error}
		<div class="alert-error" role="alert">{form.error}</div>
	{/if}
	{#if form?.success}
		<div class="alert-success" role="status">{form.success}</div>
	{/if}

	<form method="POST" class="empresa-form" use:enhance={alGuardar}>
		<div class="form-grid">
			<div class="form-field">
				<label for="name">Nombre comercial *</label>
				<input id="name" name="name" value={values.name ?? ''} required />
				{#if form?.fieldErrors?.name}<span class="form-error">{form.fieldErrors.name}</span>{/if}
			</div>
			<div class="form-field">
				<label for="rnc">RNC</label>
				<input id="rnc" name="rnc" value={values.rnc ?? ''} />
			</div>
			<div class="form-field">
				<label for="phone">Teléfono</label>
				<input id="phone" name="phone" value={values.phone ?? ''} />
			</div>
			<div class="form-field">
				<label for="email">Email</label>
				<input id="email" name="email" type="email" value={values.email ?? ''} />
				{#if form?.fieldErrors?.email}<span class="form-error">{form.fieldErrors.email}</span>{/if}
			</div>
			<div class="form-field full">
				<label for="address">Dirección</label>
				<textarea id="address" name="address" rows="2">{values.address ?? ''}</textarea>
			</div>
		</div>

		<aside class="logo">
			<span class="logo-titulo">Logotipo</span>

			<!-- El lienzo va sobre fondo hundido, así que el texto de dentro sube a
			     `--text-secondary`: la regla 7 del sistema dice que `--text-muted`
			     da 4.34:1 ahí y no llega a AA. -->
			<div class="logo-lienzo">
				{#if logo}
					<img src={logo} alt="Logotipo de {values.name ?? 'la empresa'}" />
				{:else}
					<span class="logo-vacio">Sin logotipo</span>
				{/if}
			</div>

			<!--
				Un <button>, no un <label for>. Un `label` NO se puede enfocar con el
				tabulador: en ESR Pro ese botón es inalcanzable por teclado y no se
				nota porque un `label` tampoco dibuja anillo de foco.

				`type="button"` en los dos: aquí hay un <form> alrededor, y el tipo
				por defecto de un <button> es `submit`. Sin esto, «Quitar» enviaría
				el formulario.
			-->
			<input
				bind:this={campoArchivo}
				type="file"
				accept="image/png,image/jpeg"
				onchange={alElegir}
				hidden
			/>
			<div class="logo-acciones">
				<button type="button" class="btn-secondary" onclick={() => campoArchivo.click()}>
					{logo ? 'Cambiar' : 'Subir logotipo'}
				</button>
				{#if logo}
					<button type="button" class="btn-secondary" onclick={quitar}>Quitar</button>
				{/if}
			</div>

			{#if errorLogo}<span class="form-error">{errorLogo}</span>{/if}
			{#if form?.fieldErrors?.logo_base64}
				<span class="form-error">{form.fieldErrors.logo_base64}</span>
			{/if}

			<span class="logo-ayuda">
				PNG o JPG, hasta 2 MB. Se reduce al guardarlo. Un fondo claro o transparente
				funciona mejor sobre el papel.
			</span>

			<!-- El <input type="file"> NO lleva `name` a propósito: así el archivo
			     original nunca se serializa. Lo único que viaja es el data URL ya
			     reducido, y solo cuando la acción es «set». -->
			<input type="hidden" name="logo_action" value={accion} />
			<input type="hidden" name="logo_base64" value={accion === 'set' ? logo : ''} />
		</aside>

		<div class="form-actions">
			<button type="submit" class="btn-primary">Guardar cambios</button>
		</div>
	</form>
</section>

<style>
	/* Alineado a la IZQUIERDA: basta con no escribir `margin: 0 auto`. Un bloque
	   con `max-width` ya se queda pegado al borde de inicio. */
	.empresa {
		max-width: 55rem;
	}

	/* El formulario es el grid de dos columnas; `.form-grid` vive DENTRO de la
	   celda izquierda y conserva su `auto-fit` sin pelearse con nada. Y
	   `.form-actions` ya trae `grid-column: 1 / -1` del tema, así que cae sola en
	   su fila de pie sin una línea de CSS extra.

	   `minmax(0, 1fr)` y no `1fr` a secas: el mínimo por defecto es `auto`, y un
	   <input> con un valor largo estiraría la columna y empujaría el logotipo
	   fuera de sitio. */
	.empresa-form {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(13rem, 15rem);
		gap: var(--sp-5);
		align-items: start;
	}

	.logo {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--sp-3);
		border-left: 1px dashed var(--border);
		padding-left: var(--sp-5);
	}

	.logo-titulo {
		font-size: var(--font-sm);
		font-weight: 600;
	}

	.logo-lienzo {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 8rem;
		padding: var(--sp-2);
		background: var(--surface-sunken);
		border: 1px dashed var(--border-strong);
		border-radius: var(--border-radius-sm);
		overflow: hidden;
	}

	.logo-lienzo img {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
	}

	.logo-vacio {
		font-size: var(--font-sm);
		color: var(--text-secondary);
	}

	.logo-acciones {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--sp-2);
	}

	.logo-ayuda {
		font-size: var(--font-xs);
		color: var(--text-secondary);
		text-align: center;
		line-height: 1.4;
	}

	/* En estrecho el separador deja de ser vertical y pasa a ser el de arriba. */
	@media (max-width: 860px) {
		.empresa-form {
			grid-template-columns: 1fr;
		}

		.logo {
			border-left: none;
			padding-left: 0;
			border-top: 1px dashed var(--border);
			padding-top: var(--sp-4);
		}
	}
</style>
