import { API_BASE_URL } from './config';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { Linking, Platform } from 'react-native';

type LoginResponse = {
  token: string;
  user: { id: number; nome: string; email: string; role: string; finance_group_id: number };
};

export type DashboardResponse = {
  summary: { income: number; expense: number; allocated: number };
  yearSummary: { income: number; expense: number };
  byCategory: { nome: string; total: number; percent: number }[];
  goals: Array<{
    id: number;
    nome: string;
    valor_objetivo: number;
    total_alocado: number;
  }>;
  totals: { balance: number; allocated: number; available: number };
};

export type Category = { id: number; nome: string; tipo: 'income' | 'expense' };
export type Transaction = {
  id: number;
  tipo: 'income' | 'expense';
  valor: number;
  data_ocorrencia: string;
  descricao?: string;
  categoria_id?: number | null;
  categoria_nome?: string | null;
  document_id?: number | null;
  document_name?: string | null;
  document_mime?: string | null;
};

export type Budget = {
  id: number;
  mes: string;
  valor: number;
  categoria_id: number;
  categoria_nome: string;
  tipo: 'income' | 'expense';
};

export type Goal = {
  id: number;
  nome: string;
  valor_objetivo: number;
  data_objetivo?: string | null;
  estado: 'active' | 'completed';
  total_alocado: number;
};

export type GoalAllocation = {
  id: number;
  goal_id: number;
  valor: number;
  data_alocacao: string;
  nota?: string | null;
  goal_nome: string;
};

export async function apiLogin(email: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'login_failed');
  }
  return data;
}

export async function apiGetDashboard(token: string): Promise<DashboardResponse> {
  const res = await fetch(`${API_BASE_URL}/api/dashboard`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'dashboard_failed');
  }
  return data;
}

export async function apiGetCategories(token: string): Promise<Category[]> {
  const res = await fetch(`${API_BASE_URL}/api/categories`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'categories_failed');
  }
  return data.categories || [];
}

export async function apiGetTransactions(
  token: string,
  params: { page?: number; per_page?: number; category_id?: number | null; from?: string; to?: string }
): Promise<{ items: Transaction[]; page: number; total_pages: number }> {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.per_page) qs.set('per_page', String(params.per_page));
  if (params.category_id) qs.set('category_id', String(params.category_id));
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  const res = await fetch(`${API_BASE_URL}/api/transactions?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'transactions_failed');
  }
  return { items: data.items || [], page: data.page, total_pages: data.total_pages };
}

export async function apiCreateTransaction(
  token: string,
  payload: {
    type: 'income' | 'expense';
    amount: number;
    date: string;
    description?: string;
    source?: string;
    category_id?: number | null;
  }
): Promise<{ id: number }> {
  const res = await fetch(`${API_BASE_URL}/api/transactions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'create_failed');
  }
  return data;
}

export async function apiCreateCategory(token: string, payload: { name: string; type: 'income' | 'expense' }) {
  const res = await fetch(`${API_BASE_URL}/api/categories`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'create_category_failed');
  return data;
}

export async function apiUpdateCategory(token: string, id: number, payload: { name: string; type: 'income' | 'expense' }) {
  const res = await fetch(`${API_BASE_URL}/api/categories/${id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'update_category_failed');
  return data;
}

export async function apiDeleteCategory(token: string, id: number) {
  const res = await fetch(`${API_BASE_URL}/api/categories/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'delete_category_failed');
  return data;
}

export async function apiGetBudgets(token: string): Promise<Budget[]> {
  const res = await fetch(`${API_BASE_URL}/api/budgets`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'budgets_failed');
  return data.budgets || [];
}

export async function apiCreateBudget(
  token: string,
  payload: { category_id: number; month: string; amount: number }
) {
  const res = await fetch(`${API_BASE_URL}/api/budgets`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'create_budget_failed');
  return data;
}

export async function apiUpdateBudget(
  token: string,
  id: number,
  payload: { category_id: number; month: string; amount: number }
) {
  const res = await fetch(`${API_BASE_URL}/api/budgets/${id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'update_budget_failed');
  return data;
}

export async function apiDeleteBudget(token: string, id: number) {
  const res = await fetch(`${API_BASE_URL}/api/budgets/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'delete_budget_failed');
  return data;
}

export async function apiGetGoals(token: string): Promise<{ goals: Goal[]; allocations: GoalAllocation[]; totalAllocated: number }> {
  const res = await fetch(`${API_BASE_URL}/api/goals`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'goals_failed');
  return data;
}

export async function apiCreateGoal(
  token: string,
  payload: { name: string; target_amount: number; target_date?: string | null }
) {
  const res = await fetch(`${API_BASE_URL}/api/goals`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'create_goal_failed');
  return data;
}

export async function apiUpdateGoal(
  token: string,
  id: number,
  payload: { name: string; target_amount: number; target_date?: string | null }
) {
  const res = await fetch(`${API_BASE_URL}/api/goals/${id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'update_goal_failed');
  return data;
}

export async function apiDeleteGoal(token: string, id: number) {
  const res = await fetch(`${API_BASE_URL}/api/goals/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'delete_goal_failed');
  return data;
}

export async function apiAllocateGoal(
  token: string,
  id: number,
  payload: { amount: number; date: string; note?: string }
) {
  const res = await fetch(`${API_BASE_URL}/api/goals/${id}/allocate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'allocate_goal_failed');
  return data;
}

export async function apiUpdateGoalAllocation(
  token: string,
  id: number,
  payload: { goal_id: number; amount: number; date: string; note?: string }
) {
  const res = await fetch(`${API_BASE_URL}/api/goals/allocations/${id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'update_allocation_failed');
  return data;
}

export async function apiDeleteGoalAllocation(token: string, id: number) {
  const res = await fetch(`${API_BASE_URL}/api/goals/allocations/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'delete_allocation_failed');
  return data;
}

export async function apiShareFinance(token: string, email: string) {
  const res = await fetch(`${API_BASE_URL}/api/share`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'share_failed');
  return data;
}

export async function apiUploadTransactionDocument(
  token: string,
  transactionId: number,
  file: { uri: string; name: string; mimeType?: string | null }
) {
  const form = new FormData();
  form.append('documento', {
    uri: file.uri,
    name: file.name,
    type: file.mimeType || 'application/octet-stream',
  } as any);

  const res = await fetch(`${API_BASE_URL}/api/transactions/${transactionId}/document`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'upload_failed');
  return data;
}

function extensionFromName(name?: string | null) {
  if (!name) return '';
  const match = name.match(/\\.([a-zA-Z0-9]+)$/);
  return match ? `.${match[1].toLowerCase()}` : '';
}

function extensionFromMime(mime?: string | null) {
  if (!mime) return '';
  if (mime === 'application/pdf') return '.pdf';
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'image/gif') return '.gif';
  return '';
}

export async function apiOpenDocument(
  token: string,
  documentId: number,
  opts?: { name?: string | null; mime?: string | null }
) {
  const url = `${API_BASE_URL}/api/documents/${documentId}`;
  const ext = extensionFromName(opts?.name) || extensionFromMime(opts?.mime) || '';
  const target = `${FileSystemLegacy.cacheDirectory || FileSystemLegacy.documentDirectory}doc-${documentId}${ext}`;
  const result = await FileSystemLegacy.downloadAsync(url, target, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (Platform.OS === 'android') {
    const contentUri = await FileSystemLegacy.getContentUriAsync(result.uri);
    await Linking.openURL(contentUri);
    return;
  }
  await Linking.openURL(result.uri);
}

export async function apiUpdateTransaction(
  token: string,
  id: number,
  payload: {
    type: 'income' | 'expense';
    amount: number;
    date: string;
    description?: string;
    category_id?: number | null;
  }
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/transactions/${id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'update_failed');
  }
}

export async function apiVoidTransaction(token: string, id: number): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/transactions/${id}/void`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'void_failed');
  }
}

export async function apiDeleteTransaction(token: string, id: number): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/transactions/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'delete_failed');
  }
}
