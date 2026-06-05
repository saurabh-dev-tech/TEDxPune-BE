import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { OAuthProfile } from '../auth.service';

// Cached JWKS fetcher for Apple's public keys
const AppleJWKS = createRemoteJWKSet(
  new URL('https://appleid.apple.com/auth/keys'),
);

interface AppleFullName {
  givenName?: string | null;
  familyName?: string | null;
}

/**
 * Verify Apple identity token from expo-apple-authentication.
 *
 * Apple only sends `email` and `fullName` on the FIRST sign-in.
 * Pass `fullNameFromApp` (from the native credential) so we can persist it
 * on first login. On subsequent logins those fields will be null from Apple.
 */
export async function verifyAppleIdentityToken(
  identityToken: string,
  fullNameFromApp?: AppleFullName | null,
): Promise<OAuthProfile> {
  const bundleId = process.env.APPLE_BUNDLE_ID!;

  if (!bundleId) throw new Error('APPLE_BUNDLE_ID is not configured');

  const { payload } = await jwtVerify(identityToken, AppleJWKS, {
    issuer: 'https://appleid.apple.com',
    audience: bundleId,
  });

  if (!payload.sub) throw new Error('Invalid Apple token: missing sub');

  const fullName = fullNameFromApp
    ? [fullNameFromApp.givenName, fullNameFromApp.familyName].filter(Boolean).join(' ').trim()
    : '';

  return {
    provider: 'apple',
    providerId: payload.sub,
    email: (payload.email as string) ?? '',
    fullName: fullName || 'Apple User',
    avatarUrl: null, // Apple never provides avatars
  };
}
