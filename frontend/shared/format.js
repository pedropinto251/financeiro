// Shared PT-locale formatters used across the SPA.

export const fmtEur = (n) =>
  n != null && n !== '' ? Number(n).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }) : '—';

export const fmtEurCents = (n) =>
  n != null && n !== '' ? Number(n).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' }) : '—';

// Signed amount with currency, e.g. +1.240,50 € / -85,00 €.
export const fmtEurSigned = (n) => {
  if (n == null || n === '') return '—';
  const v = Number(n);
  const sign = v > 0 ? '+' : v < 0 ? '−' : '';
  return `${sign}${Math.abs(v).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })}`;
};

export const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export const fmtDateShort = (d) =>
  d ? new Date(d).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' }) : '—';

export const fmtMonth = (d) =>
  d ? new Date(d).toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' }) : '—';

// Convert a JS Date (from a DatePicker) to a MySQL-friendly YYYY-MM-DD string.
export const toMysqlDate = (d) => {
  if (d instanceof Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return d || null;
};

// Today as YYYY-MM-DD (local, not UTC).
export const todayIso = () => toMysqlDate(new Date());
