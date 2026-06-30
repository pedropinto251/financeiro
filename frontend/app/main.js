import { createApp } from 'vue';
import PrimeVue from 'primevue/config';
import { definePreset } from '@primevue/themes';
import Aura from '@primevue/themes/aura';
import ToastService from 'primevue/toastservice';
import ConfirmationService from 'primevue/confirmationservice';
import 'primeicons/primeicons.css';
import '@shared/style.css';
import '@shared/pwa'; // regista cedo o listener de beforeinstallprompt

import App from './App.vue';
import router from './router';

// Brand emerald ramp so PrimeVue components match the graphite/emerald identity.
const Financeiro = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0', 300: '#6ee7b7',
      400: '#34d399', 500: '#10b981', 600: '#059669', 700: '#047857',
      800: '#065f46', 900: '#064e3b', 950: '#022c22',
    },
  },
});

const app = createApp(App);
app.use(PrimeVue, { theme: { preset: Financeiro, options: { darkModeSelector: '[data-theme="dark"]' } } });
app.use(ToastService);
app.use(ConfirmationService);
app.use(router);
app.mount('#app');

// Service worker (Web Push + futura cache offline).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* ignore */ });
  });
}
