/**
 * linkedInApi.ts
 *
 * Thin client that sends the LinkedIn authorization code to the TEDxPune
 * backend for secure token exchange. All sensitive operations (clientSecret,
 * token exchange, LinkedIn API calls) happen server-side.
 */

// ─── Config ───────────────────────────────────────────────────────────────────
// Set EXPO_PUBLIC_API_URL in your .env / EAS secrets — no hardcoding
const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.your-domain.com';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface AppUser {
  id: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  role: 'USER' | 'ADMIN' | 'SUPER_ADMIN';
  status: 'PENDING_APPROVAL' | 'ACTIVE' | 'BLOCKED';
}

export interface ExchangeResponse {
  accessToken: string;
  user: AppUser;
}

// ─── API call ─────────────────────────────────────────────────────────────────
/**
 * POST /api/v1/auth/linkedin/exchange
 *
 * Sends the authorization code (not the access token) to the server.
 * The server holds the clientSecret and does the actual token exchange
 * with LinkedIn, then returns our app JWT + public user fields.
 *
 * @param code        Authorization code captured from the WebView redirect
 * @param redirectUri The redirect_uri used in the WebView — must match exactly
 */
export async function exchangeLinkedInCode(
  code: string,
  redirectUri: string,
): Promise<ExchangeResponse> {
  const res = await fetch(`${API_BASE}/api/v1/auth/linkedin/exchange`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ code, redirectUri }),
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // ignore JSON parse failures
    }
    throw new Error(message);
  }

  return res.json() as Promise<ExchangeResponse>;
}
