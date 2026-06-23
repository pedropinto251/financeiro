<script setup>
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '@shared/api';
import { useUser } from '../lib/useUser';
import { useTheme } from '@shared/useTheme';

const route = useRoute();
const router = useRouter();
const { set: setUser } = useUser();
const { init: initTheme } = useTheme();
initTheme();

const email = ref('');
const password = ref('');
const error = ref('');
const busy = ref(false);

async function submit() {
  error.value = '';
  if (!email.value || !password.value) { error.value = 'Preenche email e password.'; return; }
  busy.value = true;
  try {
    const data = await api.post('/login', { email: email.value.trim(), password: password.value }, { silent: true });
    setUser(data.user || data);
    const redirect = route.query.redirect || '/dashboard';
    router.replace(typeof redirect === 'string' ? redirect : '/dashboard');
  } catch (e) {
    error.value = e.code === 'inactive' ? 'Conta desativada.' : 'Credenciais inválidas.';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="login">
    <section class="surface card login-card">
      <div class="logo"><img src="/icon.svg" alt="" /></div>
      <h1>Bem-vindo</h1>
      <p class="muted">Entra para gerir as tuas finanças.</p>

      <form class="stack" @submit.prevent="submit">
        <label class="field">
          <span>Email</span>
          <input v-model="email" type="email" autocomplete="username" required />
        </label>
        <label class="field">
          <span>Password</span>
          <input v-model="password" type="password" autocomplete="current-password" required />
        </label>
        <p v-if="error" class="err">{{ error }}</p>
        <button class="btn btn-primary btn-block" type="submit" :disabled="busy">
          <i v-if="busy" class="pi pi-spin pi-spinner" /> {{ busy ? 'A entrar…' : 'Entrar' }}
        </button>
      </form>
    </section>
  </main>
</template>

<style scoped>
.login { min-height: 100dvh; display: grid; place-items: center;
  padding: calc(1.5rem + env(safe-area-inset-top, 0px)) 1.5rem calc(1.5rem + env(safe-area-inset-bottom, 0px)); }
.login-card { width: min(420px, 94vw); padding: 1.75rem 1.6rem; text-align: center; }
.logo { width: 64px; height: 64px; margin: 0 auto 1rem; }
.logo img { width: 100%; height: 100%; display: block; filter: drop-shadow(var(--brand-glow)); }
.login-card h1 { margin-bottom: 0.25rem; }
.login-card .muted { margin-bottom: 1.5rem; }
.login-card form { text-align: left; }
.err { color: var(--danger); font-size: 0.85rem; font-weight: 600; margin: 0; }
</style>
