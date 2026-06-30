import axios from 'axios';
import { enqueue } from './outbox';

// Single axios instance for the whole SPA.
//  - baseURL '/api' (same origin as the Express app on the subdomain)
//  - withCredentials so the session cookie rides along (no tokens on the web)
//  - success interceptor unwraps a { data } envelope when present, else returns
//    the raw body (the Financeiro API returns plain objects today)
//  - error interceptor NORMALISES every failure into a friendly shape and routes
//    it to a global handler (a toast) so a 500 never surfaces raw.
const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 30000,
});

let globalErrorHandler = null;
export function setApiErrorHandler(fn) { globalErrorHandler = fn; }

// Map the API's short error codes ({ error: 'invalid' }) to friendly PT copy.
const MESSAGES = {
  missing: 'Faltam campos obrigatórios.',
  invalid: 'Dados inválidos.',
  inactive: 'Conta desativada.',
  missing_token: 'Sessão expirada. Entra novamente.',
  invalid_token: 'Sessão expirada. Entra novamente.',
  invalid_user: 'Sessão inválida. Entra novamente.',
  not_found: 'Não encontrado.',
  missing_file: 'Falta o ficheiro.',
  missing_email: 'Indica um email.',
  user_missing: 'Esse utilizador não existe.',
  self: 'Não te podes adicionar a ti próprio.',
  owner: 'Esse utilizador já é o dono do grupo.',
  server: 'Ocorreu um erro. Tenta novamente.',
};

api.interceptors.response.use(
  (res) => (res.data && Object.prototype.hasOwnProperty.call(res.data, 'data') ? res.data.data : res.data),
  (err) => {
    let norm = { code: 'network', message: 'Sem ligação ao servidor. Verifica a tua internet.', fields: null, status: 0 };
    if (err.response) {
      const status = err.response.status;
      const body = err.response.data || {};
      // The API returns { error: 'code' } (string) or { error: { code, message } }.
      const e = typeof body.error === 'string' ? { code: body.error } : (body.error || {});
      norm = {
        status,
        code: e.code || 'server',
        message: e.message || MESSAGES[e.code] || 'Ocorreu um erro. Tenta novamente.',
        fields: e.fields || null,
      };
      // Session died → bounce to the SPA login (full reload re-renders the shell).
      if (status === 401) {
        const here = window.location.pathname + window.location.search;
        if (!here.startsWith('/login')) {
          window.location.href = '/login?redirect=' + encodeURIComponent(here);
        }
      }
    } else if (err.code === 'ECONNABORTED') {
      norm.code = 'timeout';
      norm.message = 'O pedido demorou demasiado. Tenta novamente.';
    }
    // Sem rede + pedido marcado offlineQueue → guarda na outbox e resolve otimista.
    const cfg = err.config || {};
    if (norm.status === 0 && cfg.offlineQueue) {
      try {
        const data = cfg.data ? (typeof cfg.data === 'string' ? JSON.parse(cfg.data) : cfg.data) : undefined;
        enqueue({ method: cfg.method || 'post', url: cfg.url, data });
      } catch (e) { /* */ }
      return Promise.resolve({ queued: true });
    }
    const silent = err.config && err.config.silent;
    if (!silent && norm.status !== 401 && globalErrorHandler) globalErrorHandler(norm);
    return Promise.reject(norm);
  }
);

export default api;
