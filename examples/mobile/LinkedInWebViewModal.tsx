/**
 * LinkedInWebViewModal.tsx
 *
 * WebView LinkedIn OAuth modal.
 * Supports both HTTPS and custom-scheme redirect URIs (e.g. tedxpune://auth/callback).
 *
 * Flow:
 *  1. App builds the LinkedIn authorization URL locally — NO backend call at this step.
 *  2. WebView opens linkedin.com/oauth/v2/authorization
 *  3. After user logs in, LinkedIn redirects to REDIRECT_URI (e.g. tedxpune://auth/callback?code=…)
 *  4. onShouldStartLoadWithRequest intercepts the redirect before the browser follows it
 *  5. We extract ?code= and POST it to our backend /api/v1/auth/linkedin/exchange
 *  6. Backend exchanges code → LinkedIn access token → user upsert → returns our JWT
 *
 * .env (mobile):
 *   EXPO_PUBLIC_LINKEDIN_CLIENT_ID=86kkj441zxqdkn
 *   EXPO_PUBLIC_LINKEDIN_REDIRECT_URI=tedxpune://auth/callback
 *   EXPO_PUBLIC_API_URL=http://localhost:3000          ← iOS Simulator
 *
 * LinkedIn Developer Console must have the EXACT same redirect URI registered:
 *   tedxpune://auth/callback
 */

import React, { useCallback, useRef, useState } from 'react';
import {
  Modal,
  View,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  Text,
  SafeAreaView,
  Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewNavigation } from 'react-native-webview';
import { exchangeLinkedInCode, AppUser } from './linkedInApi';

// ─── Config ───────────────────────────────────────────────────────────────────
const LINKEDIN_CLIENT_ID = process.env.EXPO_PUBLIC_LINKEDIN_CLIENT_ID ?? '';
const REDIRECT_URI = process.env.EXPO_PUBLIC_LINKEDIN_REDIRECT_URI ?? '';
const SCOPES = 'openid profile email';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateState(): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function buildLinkedInAuthUrl(state: string): string {
  // ⚠️ This URL is built in the app, NOT fetched from the backend.
  // clientSecret is never involved here.
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: LINKEDIN_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    state,
  });
  return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
}

/**
 * Parse query params from any URL, including custom schemes (tedxpune://).
 * We avoid `new URL()` because Hermes has inconsistent handling of custom schemes.
 */
function parseQueryParams(url: string): Record<string, string> {
  const queryStart = url.indexOf('?');
  if (queryStart === -1) return {};
  const query = url.slice(queryStart + 1);
  const result: Record<string, string> = {};
  for (const pair of query.split('&')) {
    const [key, val] = pair.split('=');
    if (key) result[decodeURIComponent(key)] = decodeURIComponent(val ?? '');
  }
  return result;
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface Props {
  visible: boolean;
  onSuccess: (user: AppUser, accessToken: string) => void;
  onError: (error: Error) => void;
  onCancel: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────
export function LinkedInWebViewModal({ visible, onSuccess, onError, onCancel }: Props) {
  const [loading, setLoading] = useState(true);
  const [exchanging, setExchanging] = useState(false);
  const stateRef = useRef('');
  const authUrlRef = useRef('');
  const handledRef = useRef(false); // prevent double-handling

  if (visible && !stateRef.current) {
    stateRef.current = generateState();
    authUrlRef.current = buildLinkedInAuthUrl(stateRef.current);
    handledRef.current = false;
  }
  if (!visible) {
    stateRef.current = '';
    authUrlRef.current = '';
    handledRef.current = false;
  }

  const handleRedirect = useCallback(
    async (url: string) => {
      // Guard: only process once per session
      if (handledRef.current) return;
      if (!url.startsWith(REDIRECT_URI)) return;
      handledRef.current = true;

      const params = parseQueryParams(url);
      const { error, error_description, code, state: returnedState } = params;

      if (error) {
        onError(new Error(error_description ?? error));
        return;
      }

      if (returnedState !== stateRef.current) {
        onError(new Error('OAuth state mismatch — possible CSRF'));
        return;
      }

      if (!code) {
        onError(new Error('No authorization code in redirect'));
        return;
      }

      setExchanging(true);
      try {
        const { accessToken, user } = await exchangeLinkedInCode(code, REDIRECT_URI);
        onSuccess(user, accessToken);
      } catch (err) {
        onError(err instanceof Error ? err : new Error('Token exchange failed'));
      } finally {
        setExchanging(false);
      }
    },
    [onError, onSuccess],
  );

  if (!LINKEDIN_CLIENT_ID || !REDIRECT_URI) {
    return null; // misconfigured — fail silently, dev will see the env error
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={onCancel}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onCancel} disabled={exchanging} style={styles.cancelBtn}>
            <Text style={[styles.cancelText, exchanging && styles.dimmed]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Sign in with LinkedIn</Text>
          <View style={styles.cancelBtn} />
        </View>

        {!exchanging && authUrlRef.current ? (
          <WebView
            source={{ uri: authUrlRef.current }}
            // ← This is the key hook: fires BEFORE the WebView navigates.
            // Return false to block navigation to our redirect URI.
            onShouldStartLoadWithRequest={(req) => {
              if (req.url.startsWith(REDIRECT_URI)) {
                handleRedirect(req.url);
                return false; // block — we handled it
              }
              return true;
            }}
            // Fallback for Android where onShouldStartLoadWithRequest may not fire for custom schemes
            onNavigationStateChange={(nav: WebViewNavigation) => {
              if (nav.url.startsWith(REDIRECT_URI)) {
                handleRedirect(nav.url);
              }
            }}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            javaScriptEnabled
            domStorageEnabled
            thirdPartyCookiesEnabled
            style={styles.webView}
          />
        ) : null}

        {(loading || exchanging) && (
          <View style={styles.overlay}>
            <ActivityIndicator size="large" color="#0077B5" />
            {exchanging ? <Text style={styles.hint}>Signing you in…</Text> : null}
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  title: { fontSize: 16, fontWeight: '600', color: '#000' },
  cancelBtn: { width: 60 },
  cancelText: { fontSize: 16, color: '#0077B5' },
  dimmed: { opacity: 0.4 },
  webView: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  hint: { fontSize: 14, color: '#555' },
});
