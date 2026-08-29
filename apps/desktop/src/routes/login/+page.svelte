<script>
  import { goto } from '$app/navigation';

  let username = '';
  let password = '';
  let errorMsg = '';
  let loading = false;

  async function handleLogin() {
    errorMsg = '';
    
    if (!username || !password) {
      errorMsg = 'Por favor, ingrese usuario y contraseña.';
      return;
    }

    loading = true;
    try {
      const user = await window.api.auth.login({ username, password });
      
      if (user) {
        sessionStorage.setItem('esr_user', JSON.stringify(user));
        goto('/', { replaceState: true }); // go to dashboard
      } else {
        errorMsg = 'Usuario o contraseña incorrectos.';
      }
    } catch(err) {
      errorMsg = 'Error al conectar con la base de datos local.';
      console.error(err);
    } finally {
      loading = false;
    }
  }
</script>

<div class="login-container">
  <div class="login-box">
    <div class="login-header">
      🏢
      <h1>ESR Pro</h1>
      <p>Events Stock & Rentals</p>
    </div>

    <form on:submit|preventDefault={handleLogin} class="login-form">
      {#if errorMsg}
        <div class="alert-error">{errorMsg}</div>
      {/if}

      <div class="input-group">
        <label for="username">Usuario</label>
        <input type="text" id="username" bind:value={username} placeholder="Ingrese su usuario..." disabled={loading} autocomplete="off" />
      </div>

      <div class="input-group">
        <label for="password">Contraseña</label>
        <input type="password" id="password" bind:value={password} placeholder="••••••••" disabled={loading} />
      </div>

      <button type="submit" class="btn-login" disabled={loading}>
        {loading ? 'Verificando...' : 'Iniciar Sesión'}
      </button>
    </form>
    
    <div class="login-footer">
      <small>v0.0.1 - Desktop Offline</small>
    </div>
  </div>
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: 'Inter', sans-serif;
    background-color: #f3f4f6;
  }

  .login-container {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    background: linear-gradient(135deg, var(--accent) 0%, var(--accent-active) 100%);
  }

  .login-box {
    background: white;
    width: 100%;
    max-width: 400px;
    padding: 40px;
    border-radius: 12px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.15);
  }

  .login-header {
    text-align: center;
    margin-bottom: 30px;
    font-size: 3rem;
  }

  .login-header h1 {
    font-size: 1.8rem;
    color: #1a1a1a;
    margin: 10px 0 0 0;
    padding: 0;
  }

  .login-header p {
    color: #6c757d;
    font-size: 0.9rem;
    margin: 5px 0 0 0;
    text-transform: uppercase;
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
    padding: 12px 15px;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    font-size: 1rem;
    outline: none;
    transition: all 0.2s ease;
  }

  .input-group input:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(67, 94, 190, 0.1);
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
    transition: background-color 0.2s;
    margin-top: 10px;
  }

  .btn-login:hover:not(:disabled) {
    background-color: var(--accent-hover);
  }

  .btn-login:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .alert-error {
    /* El rojo puro como color de letra no pasa contraste: el par legible
       es --danger-bg de fondo con --danger-text encima. */
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
    color: var(--text-muted);
  }
</style>
