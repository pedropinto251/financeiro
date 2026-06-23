<script setup>
import { ref, onMounted, computed } from 'vue';
import Dialog from 'primevue/dialog';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import ProgressSpinner from 'primevue/progressspinner';
import api from '@shared/api';

const confirm = useConfirm();
const toast = useToast();
const list = ref([]);
const loading = ref(true);
const dlg = ref(false);
const editing = ref(null);
const form = ref({ name: '', type: 'expense' });
const busy = ref(false);

async function load(silent = false) {
  if (!silent) loading.value = true;
  try { list.value = await api.get('/categories').then((r) => r.categories || r); }
  catch (e) { /* */ } finally { loading.value = false; }
}
onMounted(load);

const income = computed(() => list.value.filter((c) => c.tipo === 'income'));
const expense = computed(() => list.value.filter((c) => c.tipo === 'expense'));

function add(type) { editing.value = null; form.value = { name: '', type }; dlg.value = true; }
function edit(c) { editing.value = c; form.value = { name: c.nome, type: c.tipo }; dlg.value = true; }

async function save() {
  if (!form.value.name.trim()) return;
  busy.value = true;
  try {
    if (editing.value) await api.put(`/categories/${editing.value.id}`, { name: form.value.name.trim(), type: form.value.type });
    else await api.post('/categories', { name: form.value.name.trim(), type: form.value.type });
    toast.add({ severity: 'success', summary: 'Guardado', life: 2000 });
    dlg.value = false; await load(true);
  } catch (e) { /* */ } finally { busy.value = false; }
}

function remove(c) {
  confirm.require({
    message: `Eliminar a categoria "${c.nome}"?`, header: 'Confirmar', icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Eliminar', rejectLabel: 'Cancelar', acceptClass: 'p-button-danger',
    accept: async () => { try { await api.delete(`/categories/${c.id}`); toast.add({ severity: 'success', summary: 'Eliminado', life: 2000 }); await load(true); } catch (e) { /* */ } },
  });
}
</script>

<template>
  <div class="page">
    <div class="page-head"><div><h1>Categorias</h1><p class="sub">Organiza receitas e despesas</p></div></div>

    <div v-if="loading" class="loading"><ProgressSpinner style="width:40px;height:40px" strokeWidth="4" /></div>
    <div v-else class="grid-2">
      <section class="surface card">
        <div class="card-head"><h2><i class="pi pi-arrow-up-right" style="color:var(--success)" /> Receitas</h2>
          <button class="btn btn-sm" @click="add('income')"><i class="pi pi-plus" /></button></div>
        <div v-if="!income.length" class="empty"><i class="pi pi-tags" />Sem categorias de receita.</div>
        <div v-else class="rows">
          <div v-for="c in income" :key="c.id" class="row">
            <div class="row-main"><div class="row-title">{{ c.nome }}</div></div>
            <button class="icon-btn" @click="edit(c)"><i class="pi pi-pencil" /></button>
            <button class="icon-btn danger" @click="remove(c)"><i class="pi pi-trash" /></button>
          </div>
        </div>
      </section>

      <section class="surface card">
        <div class="card-head"><h2><i class="pi pi-arrow-down-right" style="color:var(--danger)" /> Despesas</h2>
          <button class="btn btn-sm" @click="add('expense')"><i class="pi pi-plus" /></button></div>
        <div v-if="!expense.length" class="empty"><i class="pi pi-tags" />Sem categorias de despesa.</div>
        <div v-else class="rows">
          <div v-for="c in expense" :key="c.id" class="row">
            <div class="row-main"><div class="row-title">{{ c.nome }}</div></div>
            <button class="icon-btn" @click="edit(c)"><i class="pi pi-pencil" /></button>
            <button class="icon-btn danger" @click="remove(c)"><i class="pi pi-trash" /></button>
          </div>
        </div>
      </section>
    </div>

    <Dialog v-model:visible="dlg" modal :header="editing ? 'Editar categoria' : 'Nova categoria'" :style="{ width: '400px', maxWidth: '94vw' }" dismissableMask>
      <form class="stack" @submit.prevent="save">
        <div class="seg">
          <button type="button" class="seg-btn" :class="{ on: form.type === 'expense' }" @click="form.type = 'expense'">Despesa</button>
          <button type="button" class="seg-btn" :class="{ on: form.type === 'income' }" @click="form.type = 'income'">Receita</button>
        </div>
        <label class="field"><span>Nome</span><input v-model="form.name" type="text" required /></label>
        <div class="actions">
          <button type="button" class="btn btn-ghost" @click="dlg = false">Cancelar</button>
          <button type="submit" class="btn btn-primary" :disabled="busy"><i v-if="busy" class="pi pi-spin pi-spinner" /> Guardar</button>
        </div>
      </form>
    </Dialog>
  </div>
</template>

<style scoped>
.seg { display: flex; gap: 0.5rem; }
.seg-btn { flex: 1; padding: 0.65rem; border-radius: 12px; border: 1px solid var(--line-2); background: var(--bg-2); color: var(--ink-2); font-weight: 600; font-family: inherit; cursor: pointer; min-height: 44px; }
.seg-btn.on { background: var(--brand-soft); border-color: var(--brand); color: var(--brand); }
.actions { display: flex; gap: 0.6rem; justify-content: flex-end; }
</style>
