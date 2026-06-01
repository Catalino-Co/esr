<script>
	import '../app.css';
</script>

<div class="cloud-shell">
	<header class="cloud-topbar">
		<div class="cloud-topbar-inner">
			<a class="brand" href="/">ESR Cloud</a>
			<nav class="nav" aria-label="Principal">
				<a href="/">Inicio</a>
				<a href="/ui-test">UI test</a>
				<a href="/schema-test">Schema test</a>
			</nav>
		</div>
	</header>

	<main class="cloud-main">
		<slot />
	</main>
</div>

