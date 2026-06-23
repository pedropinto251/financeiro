<script setup>
import { ref } from 'vue';
import { useToast } from 'primevue/usetoast';
import api from '@shared/api';

const toast = useToast();
const email = ref('');
const busy = ref(false);

async function share() {
  if (!email.value.trim()) return;
  busy.value = true;
  try {
    await api.post('/share', { email: email.value.trim() });
    toast.add({ severity: 'success', summary: 'Partilhado', detail: 'O utilizador passou a ver as tuas finanças.', life: 4000 });
    email.value = '';
  } catch (e) { /* global toast */ } finally { busy.value = false; }
}
</script>

<template>
  <div class="page">
    <div class="page-head"><div><h1>Partilhar</h1><p class="sub">Dá acesso às tuas finanças a alguém do teu grupo</p></div></div>

    <section class="surface card share-card">
      <div class="share-icon"><i class="pi pi-users" /></div>
      <p class="muted">Indica o email de outro utilizador registado. Passa a partilhar o mesmo grupo financeiro — movimentos, categorias, budgets e objetivos.</p>
      <form class="stack" @submit.prevent="share">
        <label class="field"><span>Email do utilizador</span>
          <input v-model="email" type="email" placeholder="nome@dominio.pt" required />
        </label>
        <button type="submit" class="btn btn-primary btn-block" :disabled="busy">
          <i v-if="busy" class="pi pi-spin pi-spinner" /> Partilhar acesso
        </button>
      </form>
    </section>
  </div>
</template>

<style scoped>
.share-card { max-width: 480px; }
.share-icon { width: 56px; height: 56px; border-radius: 16px; display: grid; place-items: center; background: var(--brand-soft); color: var(--brand); font-size: 1.4rem; margin-bottom: 1rem; }
.share-card .muted { margin-bottom: 1.25rem; line-height: 1.55; }
</style>
