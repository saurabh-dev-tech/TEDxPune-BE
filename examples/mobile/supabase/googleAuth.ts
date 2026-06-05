/**
 * googleAuth.ts
 *
 * Complete Google Sign-In flow using Supabase as the identity layer.
 *
 * Flow:
 *   1. @react-native-google-signin gets an idToken from Google natively
 *   2. We pass that idToken to supabase.auth.signInWithIdToken()
 *   3. Supabase verifies it, creates/updates auth.users, and returns a session
 *   4. Our DB trigger (migration 003) mirrors the row into public.users
 *   5. We return the Supabase session — access_token is ready for API calls
 *
 * Install:
 *   npm install @react-native-google-signin/google-signin
 *   npx pod-install  (iOS)
 *
 * Google Cloud Console — you need TWO OAuth client IDs:
 *   • Web client     → used as webClientId below AND in Supabase dashboard
 *   • iOS client     → registered in your app (Expo config plugin handles this)
 *
 * Supabase Dashboard:
 *   Authentication → Providers → Google
 *   → Client ID:     paste your Web client ID
 *   → Client Secret: paste your Web client secret
 *
 * Mobile .env:
 *   EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=xxxx.apps.googleusercontent.com
 */

import {
  GoogleSignin,
  statusCodes,
  type User as GoogleUser,
} from '@react-native-google-signin/google-signin';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './client';

// ─── One-time setup — call in App.tsx before any auth action ─────────────────

export function configureGoogleSignIn(): void {
  GoogleSignin.configure({
    // MUST be the Web client ID (not iOS). Supabase verifies idTokens against this.
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID!,
    scopes: ['email', 'profile'],
    offlineAccess: false,
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GoogleSignInResult {
  session: Session;
  isNewUser: boolean;           // true if this is the user's first sign-in
  googleUser: GoogleUser;       // raw Google profile (name, email, photo, etc.)
}

// ─── Main sign-in function ────────────────────────────────────────────────────

export async function handleGoogleSignIn(): Promise<GoogleSignInResult> {
  // 1. Make sure Google Play Services are available (no-op on iOS)
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  // 2. Trigger the native Google sign-in UI
  const googleUserInfo = await GoogleSignin.signIn();

  const { idToken } = googleUserInfo;
  if (!idToken) {
    // This can happen on Android if Google Play Services returns without a token
    throw new Error(
      'Google sign-in succeeded but did not return an idToken. ' +
      'Ensure webClientId is the Web client ID (not the Android/iOS one).',
    );
  }

  // 3. Exchange Google idToken for a Supabase session
  //    Supabase verifies the token against Google's public keys,
  //    upserts auth.users, and returns a signed Supabase JWT.
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
  });

  if (error) {
    throw new Error(`Supabase signInWithIdToken failed: ${error.message}`);
  }

  if (!data.session) {
    throw new Error('Supabase returned no session after Google sign-in.');
  }

  // 4. Determine if this is a brand-new user
  //    Supabase sets created_at == last_sign_in_at on first login
  const { user } = data.session;
  const isNewUser =
    user.created_at != null &&
    user.last_sign_in_at != null &&
    Math.abs(new Date(user.created_at).getTime() - new Date(user.last_sign_in_at).getTime()) < 5000;

  return {
    session: data.session,
    isNewUser,
    googleUser: googleUserInfo,
  };
}

// ─── Sign-out ─────────────────────────────────────────────────────────────────

export async function handleGoogleSignOut(): Promise<void> {
  // Sign out from both Supabase (clears session) and Google (clears native state)
  const [supabaseResult] = await Promise.allSettled([
    supabase.auth.signOut(),
    GoogleSignin.signOut(),
  ]);

  if (supabaseResult.status === 'rejected') {
    throw new Error(`Supabase sign-out failed: ${String(supabaseResult.reason)}`);
  }
}

// ─── Silent sign-in (restore session on app launch) ──────────────────────────

export async function restoreGoogleSession(): Promise<Session | null> {
  // Supabase auto-refreshes from AsyncStorage — just check if a session exists
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) return null;
  return data.session;
}

// ─── Error classification helpers ────────────────────────────────────────────

export function isGoogleSignInCancelled(err: unknown): boolean {
  return (err as { code?: string })?.code === statusCodes.SIGN_IN_CANCELLED;
}

export function isPlayServicesUnavailable(err: unknown): boolean {
  return (err as { code?: string })?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE;
}

export function isSignInInProgress(err: unknown): boolean {
  return (err as { code?: string })?.code === statusCodes.IN_PROGRESS;
}
