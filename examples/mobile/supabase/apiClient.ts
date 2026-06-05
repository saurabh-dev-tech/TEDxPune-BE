/**
 * apiClient.ts
 *
 * Production-ready authenticated API client for the TEDx Pune backend.
 *
 * Features:
 *  - Auto-attaches the Supabase access token to every request
 *  - Intercepts 401 responses, refreshes the Supabase session once, and retries
 *  - Typed response helpers (get / post / patch / delete)
 *  - Logs requests in development, silent in production
 *
 * Usage:
 *   import { api } from './supabase/apiClient';
 *
 *   // GET (typed)
 *   const feed = await api.get<PostFeedResponse>('/api/v1/posts?page=1');
 *
 *   // POST
 *   const post = await api.post<Post>('/api/v1/posts', { body: 'Hello TEDx!' });
 *
 *   // PATCH
 *   const me = await api.patch<User>('/api/v1/users/me', { headline: 'Speaker' });
 *
 *   // DELETE (no body returned)
 *   await api.delete('/api/v1/posts/123');
 */

import { supabase } from './client';

const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');
const IS_DEV = process.env.NODE_ENV !== 'production';

// ─── Types ────────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

// ─── Core fetch wrapper ───────────────────────────────────────────────────────

async function getToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    throw new ApiError(401, 'No active session. Please sign in.');
  }
  return data.session.access_token;
}

async function refreshToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.refreshSession();
  if (error || !data.session) return null;
  return data.session.access_token;
}

async function request<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  options: RequestOptions = {},
  isRetry = false,
): Promise<T> {
  const token = await getToken();
  const url = `${BASE_URL}${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    ...options.headers,
  };

  if (IS_DEV) {
    console.log(`[api] ${method} ${url}`);
  }

  const res = await fetch(url, {
    method,
    headers,
    body: options.body != null ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  // ── 401: try a token refresh once ─────────────────────────────────────────
  if (res.status === 401 && !isRetry) {
    console.warn('[api] 401 received — attempting session refresh');
    const newToken = await refreshToken();

    if (!newToken) {
      // Refresh failed — force sign-out so the app navigates to login
      await supabase.auth.signOut();
      throw new ApiError(401, 'Session expired. Please sign in again.');
    }

    // Retry once with the new token
    return request<T>(method, path, options, true);
  }

  // ── 204 No Content ────────────────────────────────────────────────────────
  if (res.status === 204) {
    return undefined as unknown as T;
  }

  // ── Parse JSON ─────────────────────────────────────────────────────────────
  let data: unknown;
  const contentType = res.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  if (!res.ok) {
    const message =
      typeof data === 'object' && data !== null && 'error' in data
        ? String((data as { error: unknown }).error)
        : `HTTP ${res.status} ${res.statusText}`;

    if (IS_DEV) {
      console.error(`[api] Error ${res.status}:`, data);
    }

    throw new ApiError(res.status, message, data);
  }

  return data as T;
}

// ─── Public API surface ───────────────────────────────────────────────────────

export const api = {
  get<T>(path: string, opts?: Omit<RequestOptions, 'body'>): Promise<T> {
    return request<T>('GET', path, opts);
  },

  post<T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'body'>): Promise<T> {
    return request<T>('POST', path, { ...opts, body });
  },

  patch<T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'body'>): Promise<T> {
    return request<T>('PATCH', path, { ...opts, body });
  },

  delete<T = void>(path: string, opts?: Omit<RequestOptions, 'body'>): Promise<T> {
    return request<T>('DELETE', path, opts);
  },
};

// ─── Example usage (reference — not exported) ─────────────────────────────────
//
// import { api, ApiError } from './supabase/apiClient';
//
// async function loadFeed(page: number) {
//   try {
//     const data = await api.get<{ items: Post[]; total: number }>(
//       `/api/v1/posts?page=${page}&limit=20`
//     );
//     return data.items;
//   } catch (err) {
//     if (err instanceof ApiError && err.status === 403) {
//       Alert.alert('Account pending', 'Your account is awaiting admin approval.');
//     } else {
//       throw err;
//     }
//   }
// }
