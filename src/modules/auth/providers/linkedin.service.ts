import axios from 'axios';
import type { OAuthProfile } from '../auth.service';

const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const USERINFO_URL = 'https://api.linkedin.com/v2/userinfo';

export function buildLinkedInAuthUrl(redirectUriOverride?: string): string {
  const redirectUri = redirectUriOverride ?? process.env.LINKEDIN_CALLBACK_URL!;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.LINKEDIN_CLIENT_ID!,
    redirect_uri: redirectUri,
    scope: 'openid profile email',
    state: Math.random().toString(36).slice(2),
  });
  return `https://www.linkedin.com/oauth/v2/authorization?${params}`;
}

export async function exchangeLinkedInCode(code: string, redirectUri?: string): Promise<OAuthProfile> {
  const { data: token } = await axios.post<{ access_token: string }>(
    TOKEN_URL,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri ?? process.env.LINKEDIN_CALLBACK_URL!,
      client_id: process.env.LINKEDIN_CLIENT_ID!,
      client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  );

  const { data: info } = await axios.get<{ sub: string; email: string; name: string; picture?: string }>(
    USERINFO_URL,
    { headers: { Authorization: `Bearer ${token.access_token}` } },
  );

  return {
    provider: 'linkedin',
    providerId: info.sub,
    email: info.email,
    fullName: info.name,
    avatarUrl: info.picture ?? null,
  };
}
