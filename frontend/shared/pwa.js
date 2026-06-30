import { ref } from 'vue';

// Captura o evento de instalação da PWA (Android/desktop) e expõe um estado
// reativo + função para mostrar o prompt. No iOS não há este evento — a
// instalação é via "Adicionar ao ecrã principal".
export const canInstall = ref(false);
let deferred = null;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    canInstall.value = true;
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    canInstall.value = false;
  });
}

export function isStandalonePwa() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export async function promptInstall() {
  if (!deferred) return false;
  deferred.prompt();
  const choice = await deferred.userChoice.catch(() => ({ outcome: 'dismissed' }));
  deferred = null;
  canInstall.value = false;
  return choice && choice.outcome === 'accepted';
}
