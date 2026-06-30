<script setup>
import { onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useToast } from 'primevue/usetoast';
import Toast from 'primevue/toast';
import ConfirmDialog from 'primevue/confirmdialog';
import api, { setApiErrorHandler } from '@shared/api';
import { useUser } from './lib/useUser';
import { useTheme } from '@shared/useTheme';
import TransactionDialog from './components/TransactionDialog.vue';

const toast = useToast();
const route = useRoute();
const drawerOpen = ref(false);
const { user, load: loadUser, clear } = useUser();
const { resolved: theme, init: initTheme, toggle: toggleTheme } = useTheme();
initTheme();

// Global quick-add: a single "+" in the bottom bar opens a transaction dialog
// from anywhere. Categories are loaded once and shared.
const quickAdd = ref(false);
const categories = ref([]);
const accounts = ref([]);
async function loadCategories() {
  try { categories.value = await api.get('/categories').then((r) => r.categories || r); } catch (e) { /* */ }
  try { accounts.value = await api.get('/accounts').then((r) => r.accounts || []); } catch (e) { /* */ }
}
function onTxSaved() {
  // Let any open view refresh itself.
  window.dispatchEvent(new CustomEvent('financeiro:tx-changed'));
}

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: 'pi pi-chart-line' },
  { to: '/movimentos', label: 'Movimentos', icon: 'pi pi-arrow-right-arrow-left' },
  { to: '/categorias', label: 'Categorias', icon: 'pi pi-tags' },
  { to: '/budgets', label: 'Budgets', icon: 'pi pi-bullseye' },
  { to: '/fixas', label: 'Fixas', icon: 'pi pi-sync' },
  { to: '/contas', label: 'Contas', icon: 'pi pi-wallet' },
  { to: '/objetivos', label: 'Objetivos', icon: 'pi pi-flag' },
  { to: '/estatisticas', label: 'Estatísticas', icon: 'pi pi-chart-bar' },
  { to: '/partilhar', label: 'Partilhar', icon: 'pi pi-users' },
  { to: '/definicoes', label: 'Definições', icon: 'pi pi-cog' },
];

async function logout() {
  try { await api.post('/logout', {}, { silent: true }); } catch (e) { /* ignore */ }
  clear();
  window.location.href = '/login';
}

watch(() => route.path, () => { drawerOpen.value = false; });

onMounted(async () => {
  setApiErrorHandler((err) => {
    toast.add({ severity: 'error', summary: 'Erro', detail: err.message, life: 5000 });
  });
  await loadUser();
  if (user.value) loadCategories();
});
</script>

<template>
  <!-- Login (and any public route) renders bare, without the app chrome. -->
  <RouterView v-if="route.meta.public" />

  <div v-else class="shell">
    <!-- Mobile top bar -->
    <header class="topbar">
      <button class="hamburger" @click="drawerOpen = true" aria-label="Menu"><i class="pi pi-bars" /></button>
      <RouterLink to="/dashboard" class="brand">
        <img src="/icon.svg" alt="" class="brand-logo" /><span>Financeiro</span>
      </RouterLink>
      <span class="spacer" />
      <button class="icon-btn" @click="toggleTheme" :aria-label="theme === 'dark' ? 'Tema claro' : 'Tema escuro'">
        <i :class="theme === 'dark' ? 'pi pi-sun' : 'pi pi-moon'" />
      </button>
    </header>

    <!-- Sidebar: persistent on desktop, slide-in drawer on mobile -->
    <aside class="sidebar" :class="{ open: drawerOpen }">
      <RouterLink to="/dashboard" class="brand brand-side">
        <img src="/icon.svg" alt="" class="brand-logo" /><span>Financeiro</span>
      </RouterLink>
      <nav>
        <RouterLink v-for="n in NAV" :key="n.to" :to="n.to" class="nav-item">
          <i :class="n.icon" /><span>{{ n.label }}</span>
        </RouterLink>
      </nav>
      <div class="sidebar-foot">
        <button class="nav-item" @click="toggleTheme">
          <i :class="theme === 'dark' ? 'pi pi-sun' : 'pi pi-moon'" /><span>{{ theme === 'dark' ? 'Tema claro' : 'Tema escuro' }}</span>
        </button>
        <div v-if="user" class="who"><i class="pi pi-user" /><span>{{ user.nome || user.email }}</span></div>
        <button class="nav-item logout" @click="logout"><i class="pi pi-sign-out" /><span>Sair</span></button>
      </div>
    </aside>
    <div v-if="drawerOpen" class="scrim" @click="drawerOpen = false" />

    <!-- Bottom nav (mobile only): 2 links · central + · 2 links/menu -->
    <nav class="bottomnav">
      <RouterLink to="/dashboard" class="bn-item"><i class="pi pi-chart-line" /><span>Início</span></RouterLink>
      <RouterLink to="/movimentos" class="bn-item"><i class="pi pi-arrow-right-arrow-left" /><span>Movim.</span></RouterLink>
      <button class="bn-add" @click="quickAdd = true" aria-label="Novo movimento"><i class="pi pi-plus" /></button>
      <RouterLink to="/objetivos" class="bn-item"><i class="pi pi-flag" /><span>Objetivos</span></RouterLink>
      <button class="bn-item" @click="drawerOpen = true"><i class="pi pi-bars" /><span>Mais</span></button>
    </nav>

    <main class="content">
      <RouterView />
    </main>

    <TransactionDialog v-model:visible="quickAdd" :categories="categories" :accounts="accounts" @saved="onTxSaved" />
    <Toast position="top-center" />
    <ConfirmDialog />
  </div>
</template>

<style scoped>
/* ── Mobile-first chrome ──────────────────────────────────────────────── */
.topbar {
  position: sticky; top: 0; z-index: 30;
  display: flex; align-items: center; gap: 0.6rem;
  /* Respeita a status bar do iOS (relógio/bateria) em modo standalone */
  height: calc(58px + env(safe-area-inset-top, 0px));
  padding: env(safe-area-inset-top, 0px) 0.75rem 0;
  background: var(--glass); border-bottom: 1px solid var(--glass-border);
  -webkit-backdrop-filter: blur(var(--glass-blur)); backdrop-filter: blur(var(--glass-blur));
}
.hamburger {
  display: inline-flex; align-items: center; justify-content: center;
  width: 42px; height: 42px; border: none; background: transparent;
  border-radius: 11px; font-size: 1.2rem; color: var(--ink); cursor: pointer;
}
.brand { display: inline-flex; align-items: center; gap: 0.55rem; font-family: var(--font-display); font-weight: 700; font-size: 1.05rem; color: var(--ink); letter-spacing: -0.02em; }
.brand-logo { height: 28px; width: 28px; display: block; }
.spacer { flex: 1; }

.sidebar {
  position: fixed; top: 0; left: 0; bottom: 0; width: 268px; z-index: 50;
  background: var(--glass); border-right: 1px solid var(--glass-border);
  -webkit-backdrop-filter: blur(22px); backdrop-filter: blur(22px);
  display: flex; flex-direction: column; gap: 0.2rem;
  padding: calc(0.85rem + env(safe-area-inset-top, 0px)) 0.85rem calc(0.85rem + env(safe-area-inset-bottom, 0px));
  transform: translateX(-100%); transition: transform 0.24s var(--ease);
  overflow-y: auto;
}
.sidebar.open { transform: none; box-shadow: var(--shadow-3); }
.brand-side { padding: 0.5rem 0.6rem 1rem; font-size: 1.2rem; }
.brand-side .brand-logo { height: 32px; width: 32px; }
.nav-item {
  display: flex; align-items: center; gap: 0.8rem;
  padding: 0.72rem 0.78rem; border-radius: 12px;
  color: var(--ink-2); font-weight: 500; font-size: 0.95rem;
  width: 100%; border: none; background: transparent; cursor: pointer; font-family: inherit; text-align: left;
  transition: background var(--t-base) var(--ease), color var(--t-base) var(--ease);
}
.nav-item i { font-size: 1.05rem; width: 1.35rem; text-align: center; color: var(--ink-3); }
.nav-item:hover { background: var(--line); }
.nav-item.router-link-active { background: var(--brand-soft); color: var(--brand); }
.nav-item.router-link-active i { color: var(--brand); }
.sidebar-foot { margin-top: auto; display: flex; flex-direction: column; gap: 0.1rem; border-top: 1px solid var(--line); padding-top: 0.5rem; }
.who { display: flex; align-items: center; gap: 0.6rem; padding: 0.45rem 0.78rem; color: var(--ink-4); font-size: 0.82rem; overflow: hidden; }
.who span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.logout { color: var(--danger); }
.logout i { color: var(--danger); }
.scrim { position: fixed; inset: 0; background: rgba(2,6,18,0.55); z-index: 40; -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(2px); }

.bottomnav {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 30;
  display: flex; align-items: center; padding: 0.3rem 0.4rem calc(0.3rem + env(safe-area-inset-bottom, 0px));
  background: var(--glass); border-top: 1px solid var(--glass-border);
  -webkit-backdrop-filter: blur(var(--glass-blur)); backdrop-filter: blur(var(--glass-blur));
}
.bn-item {
  flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px;
  padding: 0.45rem 0.2rem; border-radius: 12px; border: none; background: transparent;
  color: var(--ink-4); font-size: 0.66rem; font-weight: 600; cursor: pointer; font-family: inherit;
  min-height: 52px; justify-content: center;
}
.bn-item i { font-size: 1.25rem; }
.bn-item.router-link-active { color: var(--brand); }
/* Central raised + — the primary action (add transaction) */
.bn-add {
  flex: none; width: 56px; height: 56px; margin: 0 0.3rem; margin-top: -20px;
  border-radius: 50%; border: 3px solid var(--bg); background: var(--brand-grad);
  color: #fff; font-size: 1.4rem; cursor: pointer; display: grid; place-items: center;
  box-shadow: var(--brand-glow); transition: transform var(--t-fast) var(--ease-press);
}
.bn-add:active { transform: scale(0.9); }

.content { padding: 1rem 1rem calc(76px + env(safe-area-inset-bottom, 0px)); max-width: 1180px; margin: 0 auto; }

/* ── Desktop (≥ 900px) ────────────────────────────────────────────────── */
@media (min-width: 900px) {
  .topbar, .bottomnav, .scrim { display: none; }
  .sidebar { transform: none; box-shadow: none; }
  .shell { padding-left: 268px; }
  .content { margin: 0 auto; max-width: 1280px; padding: 1.75rem 2.25rem; }
}
</style>
