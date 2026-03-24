const DEFAULT_SERVER_API = 'http://127.0.0.1:8000/api/v1';

/** Base URL for REST calls. Browser defaults to same-origin `/api/v1` (Next rewrite → gateway). */
export function getApiBase(): string {
  const env = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (env) return env.replace(/\/$/, '');
  if (typeof window !== 'undefined') return '/api/v1';
  return process.env.INTERNAL_API_URL?.trim()?.replace(/\/$/, '') || DEFAULT_SERVER_API;
}

/** Default client timeout (avoid endless spinners if API is down). */
const REQUEST_TIMEOUT_MS = 60_000;

export class ApiRequestCancelledError extends Error {
  constructor() {
    super('Request cancelled');
    this.name = 'ApiRequestCancelledError';
  }
}

export type ApiRequestOptions = { timeoutMs?: number; signal?: AbortSignal };

class ApiClient {
  private token: string | null = null;

  setToken(token: string) {
    this.token = token;
    if (typeof window !== 'undefined') {
      localStorage.setItem('token', token);
    }
  }

  getToken(): string | null {
    if (!this.token && typeof window !== 'undefined') {
      this.token = localStorage.getItem('token');
    }
    return this.token;
  }

  clearToken() {
    this.token = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    params?: Record<string, string>,
    options?: ApiRequestOptions,
  ): Promise<T> {
    const API_BASE = getApiBase();
    let url: string;
    if (API_BASE.startsWith('http')) {
      const base = new URL(API_BASE);
      base.pathname = base.pathname.replace(/\/$/, '') + path;
      if (params) {
        Object.entries(params).forEach(([k, v]) => base.searchParams.set(k, v));
      }
      url = base.toString();
    } else {
      const u = new URL(`${API_BASE}${path}`, window.location.origin);
      if (params) {
        Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
      }
      url = u.toString();
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const timeoutMs = options?.timeoutMs ?? REQUEST_TIMEOUT_MS;
    const controller = new AbortController();
    let externalAbort = false;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const ext = options?.signal;
    const onExternalAbort = () => {
      externalAbort = true;
      clearTimeout(timer);
      controller.abort();
    };
    if (ext) {
      if (ext.aborted) {
        clearTimeout(timer);
        throw new ApiRequestCancelledError();
      }
      ext.addEventListener('abort', onExternalAbort);
    }

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (e: unknown) {
      if (ext) ext.removeEventListener('abort', onExternalAbort);
      clearTimeout(timer);
      if (externalAbort) throw new ApiRequestCancelledError();
      const aborted = e instanceof Error && e.name === 'AbortError';
      throw new Error(
        aborted
          ? 'Request timed out — start the API gateway (port 8000): docker compose up -d'
          : e instanceof Error
            ? e.message === 'Failed to fetch'
              ? 'Cannot reach API — start gateway on port 8000, then refresh.'
              : e.message
            : 'Network error',
      );
    }
    if (ext) ext.removeEventListener('abort', onExternalAbort);
    clearTimeout(timer);

    if (res.status === 401) {
      this.clearToken();
      throw new Error('Unauthorized');
    }

    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: 'Request failed' }));
      throw new Error(error.detail || `HTTP ${res.status}`);
    }

    const text = await res.text();
    if (!text) return {} as T;
    return JSON.parse(text);
  }

  get<T>(path: string, params?: Record<string, string>, options?: ApiRequestOptions) {
    return this.request<T>('GET', path, undefined, params, options);
  }

  post<T>(path: string, body?: unknown, options?: ApiRequestOptions) {
    return this.request<T>('POST', path, body, undefined, options);
  }

  put<T>(path: string, body?: unknown, options?: ApiRequestOptions) {
    return this.request<T>('PUT', path, body, undefined, options);
  }

  delete<T>(path: string, options?: ApiRequestOptions) {
    return this.request<T>('DELETE', path, undefined, undefined, options);
  }
}

export const api = new ApiClient();
export default api;
