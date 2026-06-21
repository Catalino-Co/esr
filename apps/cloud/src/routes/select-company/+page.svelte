<script>
	import { enhance } from '$app/forms';

	let { data, form } = $props();
</script>

<section class="panel">
	<p class="eyebrow">Empresa activa</p>
	<h1>Seleccionar empresa</h1>
	<p>Elija la empresa con la que desea trabajar en esta sesión.</p>

	{#if data.error}
		<div class="alert-error" role="alert">{data.error}</div>
	{/if}

	{#if form?.error}
		<div class="alert-error" role="alert">{form.error}</div>
	{/if}

	{#if data.companies.length === 0}
		<p>No hay empresas disponibles para su usuario.</p>
	{:else}
		<form method="POST" class="company-list" use:enhance>
			{#each data.companies as company (company.id)}
				<label class="company-option">
					<input type="radio" name="companyId" value={company.id} required />
					<span class="company-details">
						<strong>{company.name}</strong>
						<span>{company.slug} · rol: {company.role}</span>
					</span>
				</label>
			{/each}
			<button type="submit" class="btn-primary">Continuar</button>
		</form>
	{/if}
</section>

<style>
	.alert-error {
		background: #fee2e2;
		color: #b42318;
		padding: 12px;
		border-radius: 6px;
		border: 1px solid #f87171;
		margin-bottom: 16px;
	}

	.company-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-top: 20px;
	}

	.company-option {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 14px 16px;
		border: 1px solid var(--border-color);
		border-radius: 8px;
		cursor: pointer;
		background: #fbfcff;
	}

	.company-option:has(input:checked) {
		border-color: var(--primary);
		background: #eef2fb;
	}

	.company-details {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.company-details span {
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	.btn-primary {
		align-self: flex-start;
		margin-top: 8px;
		background: var(--primary);
		color: white;
		border: none;
		padding: 12px 18px;
		border-radius: 6px;
		font-weight: 600;
		cursor: pointer;
	}

	.btn-primary:hover {
		background: var(--primary-strong);
	}
</style>
