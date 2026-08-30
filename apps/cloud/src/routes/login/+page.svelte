<script>
	import { enhance } from '$app/forms';

	let { form } = $props();
</script>

<div class="login-container">
	<div class="login-box">
		<div class="login-header">
			<span class="login-logo" aria-hidden="true">☁️</span>
			<h1>ESR Cloud</h1>
			<p>Events Stock & Rentals</p>
		</div>

		<form method="POST" class="login-form" use:enhance>
			{#if form?.error}
				<div class="alert-error" role="alert">{form.error}</div>
			{/if}

			<div class="input-group">
				<label for="email">Email</label>
				<input
					type="email"
					id="email"
					name="email"
					value={form?.email ?? ''}
					placeholder="admin-a@demo.local"
					autocomplete="email"
					required
				/>
			</div>

			<div class="input-group">
				<label for="password">Contraseña</label>
				<input
					type="password"
					id="password"
					name="password"
					placeholder="••••••••"
					autocomplete="current-password"
					required
				/>
			</div>

			<button type="submit" class="btn-login">Iniciar sesión</button>
		</form>

		<div class="login-footer">
			<small>Credenciales demo solo para desarrollo local.</small>
		</div>
	</div>
</div>

<style>
	.login-container {
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 100dvh;
		width: 100%;
		max-width: 100%;
		box-sizing: border-box;
		padding: 24px 20px;
		background: linear-gradient(135deg, var(--accent) 0%, var(--accent-active) 100%);
	}

	.login-box {
		background: white;
		width: 100%;
		max-width: 400px;
		padding: 40px;
		border-radius: 12px;
		box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
		box-sizing: border-box;
	}

	.login-header {
		text-align: center;
		margin-bottom: 30px;
	}

	.login-logo {
		display: block;
		font-size: 2.5rem;
		line-height: 1;
	}

	.login-header h1 {
		font-size: 1.8rem;
		color: #1a1a1a;
		margin: 10px 0 0;
	}

	.login-header p {
		color: #6c757d;
		font-size: 0.9rem;
		margin: 5px 0 0;
		letter-spacing: 1px;
	}

	.login-form {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.input-group {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.input-group label {
		font-size: 0.85rem;
		font-weight: 600;
		color: #4a5568;
	}

	.input-group input {
		width: 100%;
		max-width: 100%;
		padding: 12px 15px;
		border: 1px solid #e2e8f0;
		border-radius: 6px;
		font-size: 1rem;
		outline: none;
		box-sizing: border-box;
	}

	.input-group input:focus {
		border-color: var(--accent);
		box-shadow: var(--focus-ring);
	}

	.btn-login {
		background-color: var(--accent);
		color: white;
		border: none;
		padding: 14px;
		border-radius: 6px;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		margin-top: 10px;
	}

	.btn-login:hover {
		background-color: var(--accent-hover);
	}

	.alert-error {
		background-color: var(--danger-bg);
		color: var(--danger-text);
		padding: 12px;
		border-radius: 6px;
		font-size: 0.85rem;
		text-align: center;
		border: 1px solid var(--danger);
	}

	.login-footer {
		text-align: center;
		margin-top: 30px;
		color: #a0aec0;
	}
</style>
