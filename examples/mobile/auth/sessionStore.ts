/**
 * sessionStore.ts
 *
 * Secure token + user storage using expo-secure-store.
 * SecureStore is encrypted on-device (Keychain on iOS, Keystore on Android).
 *
 * Install:
 *   expo install expo-secure-store
 */

import * as SecureStore from 'expo-secure-store';

const KEYS = {
  ACCESS_TOKEN: 'tedx_access_token',
  USER: 'tedx_user',
} as const;

export interface StoredUser {
  id: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  role: 'USER' | 'ADMIN' | 'SUPER_ADMIN';
  status: 'PENDING_APPROVAL' | 'ACTIVE' | 'BLOCKED';
}

// ─── Write ────────────────────────────────────────────────────────────────────

export async function saveSession(accessToken: string, user: StoredUser): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(KEYS.ACCESS_TOKEN, accessToken),
    SecureStore.setItemAsync(KEYS.USER, JSON.stringify(user)),
  ]);
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.ACCESS_TOKEN);
}

export async function getStoredUser(): Promise<StoredUser | null> {
  const raw = await SecureStore.getItemAsync(KEYS.USER);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<{ accessToken: string; user: StoredUser } | null> {
  const [accessToken, user] = await Promise.all([getAccessToken(), getStoredUser()]);
  if (!accessToken || !user) return null;
  return { accessToken, user };
}

// ─── Clear ────────────────────────────────────────────────────────────────────

export async function clearSession(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEYS.ACCESS_TOKEN),
    SecureStore.deleteItemAsync(KEYS.USER),
  ]);
}
