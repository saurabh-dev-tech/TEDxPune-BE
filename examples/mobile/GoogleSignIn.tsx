/**
 * GoogleSignIn.tsx
 *
 * Google Sign In for React Native using @react-native-google-signin/google-signin.
 * The library handles the OAuth flow natively — we never touch clientSecret on device.
 * We send the idToken to the backend for server-side verification.
 *
 * Install:
 *   npm install @react-native-google-signin/google-signin
 *   npx pod-install   (iOS)
 *
 * Google Cloud Console setup:
 *   1. Create an iOS OAuth client ID  (for the app)
 *   2. Create a Web OAuth client ID  (backend — this is used as webClientId below)
 *   3. Add both to your app
 *
 * Backend env:
 *   GOOGLE_CLIENT_ID=<Web client ID>.apps.googleusercontent.com
 */

import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { AppUser } from './linkedInApi';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? '';

// Call once at app startup (e.g. in App.tsx)
export function configureGoogleSignIn() {
  GoogleSignin.configure({
    // Web client ID from Google Cloud Console (not the iOS one)
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID!,
    offlineAccess: false,
    scopes: ['email', 'profile'],
  });
}

export interface GoogleAuthResult {
  accessToken: string;
  user: AppUser;
}

export async function signInWithGoogle(): Promise<GoogleAuthResult> {
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const userInfo = await GoogleSignin.signIn();

  // idToken is the JWT signed by Google — safe to send to backend
  const { idToken } = userInfo;
  if (!idToken) throw new Error('Google sign-in did not return an idToken');

  const res = await fetch(`${API_BASE}/api/v1/auth/google/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<GoogleAuthResult>;
}

export async function signOutGoogle() {
  try {
    await GoogleSignin.signOut();
  } catch {
    // ignore
  }
}

// ─── Error helpers ────────────────────────────────────────────────────────────
export function isGoogleSignInCancelled(err: unknown): boolean {
  return (err as { code?: string })?.code === statusCodes.SIGN_IN_CANCELLED;
}

export function isGooglePlayServicesError(err: unknown): boolean {
  return (err as { code?: string })?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE;
}
