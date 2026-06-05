/**
 * AppleSignIn.tsx
 *
 * Apple Sign In for React Native using expo-apple-authentication.
 * Apple provides a signed identityToken (JWT) — we verify it server-side.
 *
 * Install:
 *   expo install expo-apple-authentication
 *
 * Xcode setup:
 *   Signing & Capabilities → + Capability → Sign In with Apple
 *
 * Backend env:
 *   APPLE_BUNDLE_ID=com.yourcompany.tedxpune   (must match Xcode bundle identifier)
 *
 * IMPORTANT: Apple only sends email + fullName on the VERY FIRST sign-in.
 * We always pass fullName to the backend even if it's null — the backend
 * handles merging it with any previously stored value.
 */

import * as AppleAuthentication from 'expo-apple-authentication';
import { AppUser } from './linkedInApi';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? '';

export interface AppleAuthResult {
  accessToken: string;
  user: AppUser;
}

export async function signInWithApple(): Promise<AppleAuthResult> {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  const { identityToken, fullName } = credential;
  if (!identityToken) throw new Error('Apple Sign In did not return an identity token');

  const res = await fetch(`${API_BASE}/api/v1/auth/apple/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identityToken,
      // fullName is only non-null on the first sign-in
      fullName: fullName
        ? { givenName: fullName.givenName, familyName: fullName.familyName }
        : null,
    }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<AppleAuthResult>;
}

/** Returns true on iOS 13+, always false on Android */
export async function isAppleSignInAvailable(): Promise<boolean> {
  return AppleAuthentication.isAvailableAsync();
}

export function isAppleSignInCancelled(err: unknown): boolean {
  return (err as { code?: string })?.code === 'ERR_REQUEST_CANCELED';
}
