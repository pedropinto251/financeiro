import { ref } from 'vue';

// Light/dark theme. Persists to localStorage under 'financeiro-theme' and writes
// <html data-theme="..."> so both our tokens and PrimeVue's palette flip together.
// Defaults to dark — this is a dark-premium app first.
const KEY = 'financeiro-theme';
const pref = ref('system');     // 'light' | 'dark' | 'system'
const resolved = ref('dark');   // 'light' | 'dark' (what's actually shown)
let mql = null;

function systemDark() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function apply() {
  resolved.value = pref.value === 'system' ? (systemDark() ? 'dark' : 'light') : pref.value;
  const root = document.documentElement;
  root.setAttribute('data-theme', resolved.value);
  root.setAttribute('data-theme-pref', pref.value);
}

function set(next) {
  pref.value = next;
  try { localStorage.setItem(KEY, next); } catch (e) { /* ignore */ }
  apply();
}

let started = false;
export function useTheme() {
  function init() {
    if (started) return;
    started = true;
    try { pref.value = localStorage.getItem(KEY) || 'dark'; } catch (e) { pref.value = 'dark'; }
    apply();
    if (window.matchMedia) {
      mql = window.matchMedia('(prefers-color-scheme: dark)');
      mql.addEventListener('change', () => { if (pref.value === 'system') apply(); });
    }
  }
  function toggle() { set(resolved.value === 'dark' ? 'light' : 'dark'); }
  return { pref, resolved, init, set, toggle };
}
