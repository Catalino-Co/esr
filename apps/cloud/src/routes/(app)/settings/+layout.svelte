<script>
	import { page } from '$app/state';
	import { BackLink } from '@esr/ui';
	import { settingsSectionFor } from '$lib/settings-sections';

	let { children } = $props();

	/**
	 * Solo dentro de una seccion: en la portada no hay adonde volver.
	 *
	 * Es un enlace de vuelta, no una miga completa: el topbar ya enuncia el
	 * nombre y la descripcion de la seccion justo encima, asi que repetirlo
	 * aqui seria la tercera vez en dos centimetros. Sustituye a los siete
	 * botones «Volver» que cada subpagina se pintaba por su cuenta.
	 *
	 * Desde que es SOLO EL ICONO, esa tercera repeticion desaparece del todo y
	 * ademas ocupa una linea menos de alto. El componente es el mismo que usa
	 * ESR Pro dentro de sus tarjetas.
	 */
	const section = $derived(settingsSectionFor(page.url.pathname));

	/**
	 * Solo en la RAIZ de la seccion.
	 *
	 * `/settings/articles/new` y `/settings/articles/[id]` cuelgan de una
	 * seccion pero no son ella: alli lo util es volver a la lista de articulos,
	 * no saltarse dos niveles hasta Configuracion. Esas dos ponen su propio
	 * enlace, y si este saliera tambien habria dos flechas en la misma pantalla
	 * apuntando a sitios distintos.
	 */
	const enRaiz = $derived(section ? page.url.pathname === section.href : false);
</script>

{#if enRaiz}
	<!-- El margen negativo alinea el icono con el borde del panel de abajo: sin
	     el, su relleno lo dejaria un pelo hacia dentro y las dos cajas no
	     compartirian eje. Es -6px y no -8px porque el boton ya no tiene el
	     relleno horizontal que tenia con texto. -->
	<div class="settings-back">
		<BackLink href="/settings" label="Volver a Configuración" />
	</div>
{/if}

{@render children()}

<style>
	.settings-back {
		margin: 0 0 var(--sp-3) -6px;
	}
</style>
