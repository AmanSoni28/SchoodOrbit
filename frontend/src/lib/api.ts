export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: any) { super(message); }
}

const BASE = '/api/v1';
const readCookie = (name: string) => document.cookie.split('; ').find((c) => c.startsWith(name + '='))?.split('=')[1];

async function ensureCsrf() {
  if (!readCookie('csrf_token')) await fetch(`${BASE}/auth/csrf`, { credentials: 'same-origin' });
  return readCookie('csrf_token') ?? '';
}

let refreshing: Promise<boolean> | null = null;
async function refresh() {
  // One refresh at a time: concurrent 401s share the same rotation.
  refreshing ??= (async () => {
    const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'same-origin', headers: { 'x-csrf-token': await ensureCsrf() } });
    return res.ok;
  })().finally(() => setTimeout(() => (refreshing = null), 0));
  return refreshing;
}

type Opts = { method?: string; body?: unknown; form?: FormData; retry?: boolean };

// Set by AuthProvider: called when the session can't be recovered, so the UI drops the stale user.
let onSessionExpired: () => void = () => {};
export const setSessionExpiredHandler = (fn: () => void) => { onSessionExpired = fn; };
const AUTH_FLOW = ['/auth/login', '/auth/refresh', '/auth/logout', '/auth/password/', '/auth/csrf'];

export async function api<T = any>(path: string, opts: Opts = {}): Promise<T> {
  const method = opts.method ?? (opts.body || opts.form ? 'POST' : 'GET');
  const headers: Record<string, string> = {};
  if (method !== 'GET') headers['x-csrf-token'] = await ensureCsrf();
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, { method, headers, credentials: 'same-origin', body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined) });
  const authFlow = AUTH_FLOW.some((p) => path.startsWith(p));
  if (res.status === 401 && !authFlow) {
    // Retry once after refreshing — even if our refresh lost a race, another tab/request may have set new cookies.
    if (opts.retry !== false) { await refresh(); return api<T>(path, { ...opts, retry: false }); }
    onSessionExpired();
  }
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await res.json() : null;
  if (!res.ok) {
    const e = payload?.error;
    throw new ApiError(res.status, e?.code ?? 'HTTP_' + res.status, e?.message ?? (res.status === 0 ? 'Network error' : 'Request failed'), e?.details);
  }
  return payload as T;
}

/** Shorthand for `{ data }` envelopes. */
export const get = async <T = any>(path: string) => (await api<{ data: T }>(path)).data;
export const send = async <T = any>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown) => (await api<{ data: T }>(path, { method, body: body ?? (method === 'DELETE' ? undefined : {}) })).data;

export async function uploadFile(file: File) {
  const form = new FormData();
  form.append('file', file);
  return (await api<{ data: { id: string; originalName: string; mimeType: string; size: number } }>('/files', { form })).data;
}

export const fileUrl = (id: string) => `${BASE}/files/${id}/download`;
export const downloadUrl = (path: string) => `${BASE}${path}`;
