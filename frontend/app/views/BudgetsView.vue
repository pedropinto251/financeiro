<script setup>
import { ref, onMounted, computed } from 'vue';
import Dialog from 'primevue/dialog';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import ProgressSpinner from 'primevue/progressspinner';
import api from '@shared/api';
import { fmtEurCents, fmtMonth } from '@shared/format';

const confirm = useConfirm();
const toast = useToast();
const list = ref([]);
const categories = ref([]);
const loading = ref(true);
const dlg = ref(false);
const editing = ref(null);
const busy = ref(false);

const nowMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const form = ref({ category_id: '', month: nowMonth(), amount: null });

async function load(silent = false) {
  if (!silent) loading.value = true;
  try {
    const [b, c] = await Promise.all([
      api.get('/budgets').then((r) => r.budgets || r),
      api.get('/categories').then((r) => r.categories || r),
    ]);
    list.value = b; categories.value = c;
  } catch (e) { /* */ } finally { loading.value = false; }
}
onMounted(load);

const expenseCats = computed(() => categories.value.filter((c) => c.tipo === 'expense'));

function add() { editing.value = null; form.value = { category_id: '', month: nowMonth(), amount: null }; dlg.value = true; }
function edit(b) {
  editing.value = b;
  form.value = { category_id: b.categoria_id, month: String(b.mes).slice(0, 7), amount: Number(b.valor) };
  dlg.value = true;
}

async function save() {
  if (!form.value.category_id || !form.value.amount) { toast.add({ severity: 'warn', summary: 'Faltam dados', life: 2500 }); return; }
  busy.value = true;
  const payload = { category_id: form.value.category_id, month: `${form.value.month}-01`, amount: form.value.amount };
  try {
    if (editing.value) await api.put(`/budgets/${editing.value.id}`, payload);
    else await api.post('/budgets', payload);
    toast.add({ severity: 'success', summary: 'Guardado', life: 2000 });
    dlg.value = false; await load(true);
  } catch (e) { /* */ } finally { busy.value = false; }
}

function remove(b) {
  confirm.require({
    message: `Eliminar o budget de "${b.categoria_nome}"?`, header: 'Confirmar', icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Eliminar', rejectLabel: 'Cancelar', acceptClass: 'p-button-danger',
    accept: async () => { try { await api.delete(`/budgets/${b.id}`); toast.add({ severity: 'success', summary: 'Eliminado', life: 2000 }); await load(true); } catch (e) { /* */ } },
  });
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div><h1>Budgets</h1><p class="sub">Limites por categoria e mês</p></div>
      <button class="btn btn-primary btn-sm" @click="add"><i class="pi pi-plus" /> Novo</button>
    </div>

    <div v-if="loading" class="loading"><ProgressSpinner style="width:40px;height:40px" strokeWidth="4" /></div>
    <div v-else-if="!list.length" class="surface card empty"><i class="pi pi-bullseye" />Ainda não tens budgets.</div>
    <section v-else class="surface card">
      <div class="rows">
        <div v-for="b in list" :key="b.id" class="row">
          <div class="bgt-icon"><i class="pi pi-bullseye" /></div>
          <div class="row-main">
            <div class="row-title">{{ b.categoria_nome }}</div>
            <div class="row-sub">{{ fmtMonth(b.mes) }}</div>
          </div>
          <div class="row-amount">{{ fmtEurCents(b.valor) }}</div>
          <button class="icon-btn" @click="edit(b)"><i class="pi pi-pencil" /></button>
          <button class="icon-btn danger" @click="remove(b)"><i class="pi pi-trash" /></button>
        </div>
      </div>
    </section>

    <button class="fab" @click="add"><i class="pi pi-plus" /></button>

    <Dialog v-model:visible="dlg" modal :header="editing ? 'Editar budget' : 'Novo budget'" :style="{ width: '420px', maxWidth: '94vw' }" dismissableMask>
      <form class="stack" @submit.prevent="save">
        <label class="field"><span>Categoria</span>
          <select v-model="form.category_id" required>
            <option value="">Escolhe uma categoria</option>
            <option v-for="c in expenseCats" :key="c.id" :value="c.id">{{ c.nome }}</option>
          </select>
        </label>
        <label class="field"><span>Mês</span><input v-model="form.month" type="month" required /></label>
        <label class="field"><span>Limite (€)</span><input v-model.number="form.amount" type="number" step="0.01" min="0" inputmode="decimal" required /></label>
        <div class="actions">
          <button type="button" class="btn btn-ghost" @click="dlg = false">Cancelar</button>
          <button type="submit" class="btn btn-primary" :disabled="busy"><i v-if="busy" class="pi pi-spin pi-spinner" /> Guardar</button>
        </div>
      </form>
    </Dialog>
  </div>
</template>

<style scoped>
.bgt-icon { width: 38px; height: 38px; border-radius: 11px; display: grid; place-items: center; flex: none; background: var(--brand-soft); color: var(--brand); }
.actions { display: flex; gap: 0.6rem; justify-content: flex-end; }
</style>
