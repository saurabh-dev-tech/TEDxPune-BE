/**
 * client.ts
 *
 * Single shared Supabase client for the entire React Native app.
 * Import `supabase` anywhere you need auth or DB access.
 *
 * Install:
 *   npm install @supabase/supabase-js @react-native-async-storage/async-storage
 *   npx pod-install  (iOS)
 *
 * Expo app.json — add the following to prevent Metro bundler issues:
 *   {
 *     "expo": {
 *       "plugins": [
 *         ["expo-build-properties", { "ios": { "deploymentTarget": "13.0" } }]
 *       ]
 *     }
 *   }
 *
 * Mobile .env:
 *   EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
 *   EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...   ← anon/public key, safe to expose
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing Supabase config.\n' +
    'Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in your .env file.',
  );
}

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Persist the session in AsyncStorage across app restarts
    storage: AsyncStorage,
    // Automatically refresh the access token before it expires (every ~55 min)
    autoRefreshToken: true,
    persistSession: true,
    // Disable URL-based session detection (not applicable in React Native)
    detectSessionInUrl: false,
  },
});

/**
 * Get the current access token synchronously from the cached session.
 * Returns null if the user is not signed in or session has expired.
 *
 * Usage:
 *   const token = await getAccessToken();
 *   fetch(url, { headers: { Authorization: `Bearer ${token}` } })
 */
export async function getAccessToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) return null;
  return data.session.access_token;
}

/**
 * Subscribe to auth state changes (sign in / sign out / token refresh).
 * Call this once in your root component.
 *
 * Returns the unsubscribe function — call it in useEffect cleanup.
 *
 * Example:
 *   useEffect(() => {
 *     const { data: { subscription } } = onAuthStateChange((session) => {
 *       setSession(session);
 *     });
 *     return () => subscription.unsubscribe();
 *   }, []);
 */
export function onAuthStateChange(
  callback: (session: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']) => void,
) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
}
