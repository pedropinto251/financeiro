import { ref } from 'vue';
import api from '@shared/api';

// Current session user, loaded once from /api/me (session cookie auth).
const user = ref(null);
let loaded = false;
let inflight = null;

export function useUser() {
  async function load(force = false) {
    if (loaded && !force) return user.value;
    if (inflight) return inflight;
    inflight = api.get('/me', { silent: true })
      .then((data) => { user.value = data.user || data; loaded = true; return user.value; })
      .catch(() => { user.value = null; return null; })
      .finally(() => { inflight = null; });
    return inflight;
  }
  function set(u) { user.value = u; loaded = true; }
  function clear() { user.value = null; loaded = false; }
  const isAdmin = () => user.value?.role === 'admin';
  return { user, load, set, clear, isAdmin };
}
