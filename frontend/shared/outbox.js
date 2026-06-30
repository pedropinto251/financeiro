import { ref } from 'vue';

// Fila offline (outbox): guarda mutações feitas sem rede e reenvia-as quando a
// ligação volta. Persistida em localStorage. Usada para criar movimentos offline.
const KEY = 'financeiro-outbox';
export const pending = ref(load().length);

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; }
}
function save(q) {
  try { localStorage.setItem(KEY, JSON.stringify(q)); } catch (e) { /* */ }
  pending.value = q.length;
}

export function enqueue(op) {
  const q = load();
  q.push({ ...op, ts: Date.now() });
  save(q);
}

let flushing = false;
// Reenvia a fila pela ordem. `api` é a instância axios. Devolve nº sincronizado.
export async function flush(api) {
  if (flushing || typeof navigator !== 'undefined' && !navigator.onLine) return 0;
  flushing = true;
  let done = 0;
  try {
    let q = load();
    while (q.length) {
      const op = q[0];
      try {
        await api.request({ method: op.method, url: op.url, data: op.data });
        q.shift(); save(q); done += 1;
      } catch (e) {
        // Ainda offline → para e tenta mais tarde. Outro erro (4xx) → descarta para não bloquear.
        if (!e || e.status === 0 || e.code === 'network' || e.code === 'timeout') break;
        q.shift(); save(q);
      }
    }
  } finally { flushing = false; }
  return done;
}
