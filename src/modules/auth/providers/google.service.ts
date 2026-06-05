import axios from 'axios';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { OAuthProfile } from '../auth.service';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

// Cached JWKS fetcher — jose handles caching + rotation automatically
const GoogleJWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/oauth2/v3/certs'),
);

// ─── Web flow ─────────────────────────────────────────────────────────────────
export function buildGoogleAuthUrl(redirectUriOverride?: string): string {
  const redirectUri = redirectUriOverride ?? process.env.GOOGLE_CALLBACK_URL!;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'select_account',
    state: Math.random().toString(36).slice(2),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeGoogleCode(code: string, redirectUri?: string): Promise<OAuthProfile> {
  const { data: token } = await axios.post<{ access_token: string }>(
    TOKEN_URL,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri ?? process.env.GOOGLE_CALLBACK_URL!,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  );

  const { data: info } = await axios.get<{
    sub: string;
    email: string;
    name: string;
    picture?: string;
  }>(USERINFO_URL, { headers: { Authorization: `Bearer ${token.access_token}` } });

  return {
    provider: 'google',
    providerId: info.sub,
    email: info.email,
    fullName: info.name,
    avatarUrl: info.picture ?? null,
  };
}

// ─── Mobile flow: verify idToken from @react-native-google-signin ─────────────
export async function verifyGoogleIdToken(idToken: string): Promise<OAuthProfile> {
  const clientId = process.env.GOOGLE_CLIENT_ID!;

  const { payload } = await jwtVerify(idToken, GoogleJWKS, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: clientId,
  });

  if (!payload.sub || !payload.email) {
    throw new Error('Invalid Google token: missing sub or email');
  }

  return {
    provider: 'google',
    providerId: payload.sub,
    email: payload.email as string,
    fullName: (payload.name as string) ?? (payload.given_name as string) ?? 'Google User',
    avatarUrl: (payload.picture as string) ?? null,
  };
}
