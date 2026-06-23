import { createApp } from 'vue';
import PrimeVue from 'primevue/config';
import { definePreset } from '@primevue/themes';
import Aura from '@primevue/themes/aura';
import ToastService from 'primevue/toastservice';
import ConfirmationService from 'primevue/confirmationservice';
import 'primeicons/primeicons.css';
import '@shared/style.css';

import App from './App.vue';
import router from './router';

// Brand blue→violet ramp so PrimeVue components match the glass identity.
const Financeiro = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#eef3ff', 100: '#dde7ff', 200: '#bcd0ff', 300: '#93b2ff',
      400: '#6f93ff', 500: '#5b8cff', 600: '#4570e6', 700: '#3658bd',
      800: '#2c4796', 900: '#283c78', 950: '#1a274d',
    },
  },
});

const app = createApp(App);
app.use(PrimeVue, { theme: { preset: Financeiro, options: { darkModeSelector: '[data-theme="dark"]' } } });
app.use(ToastService);
app.use(ConfirmationService);
app.use(router);
app.mount('#app');
