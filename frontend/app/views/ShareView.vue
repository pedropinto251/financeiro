<script setup>
import { ref, onMounted } from 'vue';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import api from '@shared/api';

const confirm = useConfirm();
const toast = useToast();
const email = ref('');
const busy = ref(false);
const members = ref([]);
const meId = ref(null);

async function loadMembers() {
  try { const r = await api.get('/share/members'); members.value = r.members || []; meId.value = r.me; } catch (e) { /* */ }
}
onMounted(loadMembers);

async function share() {
  if (!email.value.trim()) return;
  busy.value = true;
  try {
    await api.post('/share', { email: email.value.trim() });
    toast.add({ severity: 'success', summary: 'Partilhado', detail: 'O utilizador passou a ver as tuas finanças.', life: 4000 });
    email.value = '';
    await loadMembers();
  } catch (e) { /* global toast */ } finally { busy.value = false; }
}

function removeMember(m) {
  confirm.require({
    message: `Remover ${m.nome || m.email} do grupo? Deixa de ver estas finanças (os dados ficam contigo).`,
    header: 'Confirmar', icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Remover', rejectLabel: 'Cancelar', acceptClass: 'p-button-danger',
    accept: async () => {
      try { await api.delete(`/share/members/${m.id}`); toast.add({ severity: 'success', summary: 'Removido', life: 2000 }); await loadMembers(); }
      catch (e) { /* */ }
    },
  });
}
</script>

<template>
  <div class="page">
    <div class="page-head"><div><h1>Partilhar</h1><p class="sub">Dá acesso às tuas finanças a alguém</p></div></div>

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

    <section v-if="members.length" class="surface card">
      <div class="card-head"><h2>Com acesso ({{ members.length }})</h2></div>
      <div class="rows">
        <div v-for="m in members" :key="m.id" class="row">
          <span class="m-av">{{ (m.nome || m.email || '?').charAt(0).toUpperCase() }}</span>
          <div class="row-main">
            <div class="row-title">{{ m.nome || m.email }}<span v-if="m.id === meId" class="chip neutral" style="margin-left:0.4rem">tu</span></div>
            <div class="row-sub">{{ m.email }}</div>
          </div>
          <button v-if="m.id !== meId" class="icon-btn danger" @click="removeMember(m)" aria-label="Remover"><i class="pi pi-user-minus" /></button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.share-card { max-width: 480px; }
.share-icon { width: 56px; height: 56px; border-radius: 16px; display: grid; place-items: center; background: var(--brand-soft); color: var(--brand); font-size: 1.4rem; margin-bottom: 1rem; }
.share-card .muted { margin-bottom: 1.25rem; line-height: 1.55; }
.m-av { width: 38px; height: 38px; border-radius: 50%; flex: none; display: grid; place-items: center; background: var(--brand-grad); color: #fff; font-weight: 700; font-family: var(--font-display); }
</style>
