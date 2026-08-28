<script>
	let { user, role, company } = $props();
	let open = $state(false);

	function toggle(event) {
		event.stopPropagation();
		open = !open;
	}

	function close() {
		open = false;
	}
</script>

{#if open}
	<button type="button" class="menu-backdrop" aria-label="Cerrar menú" onclick={close}></button>
{/if}

<div class="user-menu">
	<button type="button" class="user-trigger" onclick={toggle} aria-expanded={open}>
		<span class="user-avatar" aria-hidden="true">{user?.name?.charAt(0)?.toUpperCase() ?? 'U'}</span>
		<span class="user-info">
			<strong>{user?.name ?? 'Usuario'}</strong>
			<small>{role ?? '—'} · {company?.name ?? '—'}</small>
		</span>
	</button>

	{#if open}
		<div class="user-dropdown" role="menu">
			<div class="user-dropdown-meta">
				<strong>{user?.name}</strong>
				<span>{user?.email}</span>
			</div>
			<form method="POST" action="/logout">
				<button type="submit" class="logout-btn">Cerrar sesión</button>
			</form>
		</div>
	{/if}
</div>

<style>
	.user-menu {
		position: relative;
	}

	.user-trigger {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 10px 6px 6px;
		border: 1px solid var(--cloud-border);
		border-radius: 999px;
		background: var(--cloud-surface);
		cursor: pointer;
		text-align: left;
	}

	.user-trigger:hover {
		border-color: #c5d0e3;
	}

	.user-avatar {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 34px;
		height: 34px;
		border-radius: 50%;
		background: var(--cloud-primary-soft);
		color: var(--cloud-primary);
		font-weight: 700;
		font-size: 0.9rem;
	}

	.user-info {
		display: flex;
		flex-direction: column;
		line-height: 1.2;
		padding-right: 4px;
	}

	.user-info strong {
		font-size: 0.88rem;
		color: var(--cloud-text);
	}

	.user-info small {
		font-size: 0.72rem;
		color: var(--cloud-muted);
		max-width: 160px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.user-dropdown {
		position: absolute;
		top: calc(100% + 8px);
		right: 0;
		min-width: 220px;
		padding: 12px;
		background: var(--cloud-surface);
		border: 1px solid var(--cloud-border);
		border-radius: 10px;
		box-shadow: var(--cloud-shadow-md);
		z-index: 50;
	}

	.user-dropdown-meta {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin-bottom: 10px;
		padding-bottom: 10px;
		border-bottom: 1px solid var(--cloud-border);
	}

	.user-dropdown-meta strong {
		font-size: 0.92rem;
		color: var(--cloud-text);
	}

	.user-dropdown-meta span {
		font-size: 0.8rem;
		color: var(--cloud-muted);
	}

	.logout-btn {
		width: 100%;
		padding: 10px 12px;
		border: none;
		border-radius: 8px;
		background: #fef2f2;
		color: var(--cloud-danger);
		font-weight: 600;
		cursor: pointer;
	}

	.logout-btn:hover {
		background: #fee2e2;
	}

	.menu-backdrop {
		position: fixed;
		inset: 0;
		z-index: 45;
		border: none;
		background: transparent;
		cursor: default;
	}

	@media (max-width: 768px) {
		.user-info {
			display: none;
		}

		.user-trigger {
			padding: 4px;
			border-radius: 50%;
		}
	}
</style>
