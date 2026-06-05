/**
 * LinkedInAuth.tsx
 *
 * WebView-based LinkedIn OAuth modal for React Native.
 * Uses react-native-linkedin with shouldGetAccessToken={false} so the
 * clientSecret never touches the mobile device — only the auth code is
 * retrieved and immediately forwarded to the backend for token exchange.
 *
 * Install deps:
 *   npm install react-native-linkedin react-native-webview
 *
 * Usage:
 *   <LinkedInAuth
 *     visible={showAuth}
 *     onSuccess={(user, token) => { ... }}
 *     onError={(err) => { ... }}
 *     onCancel={() => setShowAuth(false)}
 *   />
 */

import React, { useRef } from 'react';
import {
  Modal,
  View,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  Text,
  SafeAreaView,
} from 'react-native';
import LinkedIn from 'react-native-linkedin';
import { exchangeLinkedInCode, AppUser } from './linkedInApi';

// ─── Config ────────────────────────────────────────────────────────────────────
// SAFE to commit: clientID is public. Never put clientSecret here.
const LINKEDIN_CLIENT_ID = process.env.EXPO_PUBLIC_LINKEDIN_CLIENT_ID!;

// This URI must be registered verbatim in your LinkedIn Developer Console:
//   https://www.linkedin.com/developers/apps → Auth → Redirect URLs
//
// For mobile WebView flows LinkedIn still requires an HTTPS URI.
// The WebView intercepts the redirect before the browser actually navigates
// to it, so the URI does NOT need to be a real server endpoint —
// but it MUST be registered and identical in all three places:
//   1. LinkedIn Developer Console
//   2. This env variable (EXPO_PUBLIC_LINKEDIN_REDIRECT_URI)
//   3. The backend .env LINKEDIN_MOBILE_REDIRECT_URI (sent during code exchange)
//
// Recommended value: https://<your-api-domain>/api/v1/auth/linkedin/mobile
const REDIRECT_URI = process.env.EXPO_PUBLIC_LINKEDIN_REDIRECT_URI!;

if (!LINKEDIN_CLIENT_ID || !REDIRECT_URI) {
  throw new Error(
    'Set EXPO_PUBLIC_LINKEDIN_CLIENT_ID and EXPO_PUBLIC_LINKEDIN_REDIRECT_URI in your .env',
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface Props {
  visible: boolean;
  onSuccess: (user: AppUser, accessToken: string) => void;
  onError: (error: Error) => void;
  onCancel: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────
export function LinkedInAuth({ visible, onSuccess, onError, onCancel }: Props) {
  const linkedInRef = useRef<InstanceType<typeof LinkedIn>>(null);

  const handleSuccess = async (authCode: string) => {
    try {
      const { accessToken, user } = await exchangeLinkedInCode(authCode, REDIRECT_URI);
      onSuccess(user, accessToken);
    } catch (err) {
      onError(err instanceof Error ? err : new Error('Authentication failed'));
    }
  };

  const handleError = (error: Record<string, unknown>) => {
    onError(new Error(String(error.message ?? 'LinkedIn login failed')));
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onCancel} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Sign in with LinkedIn</Text>
          <View style={styles.cancelBtn} />
        </View>

        <LinkedIn
          ref={linkedInRef}
          clientID={LINKEDIN_CLIENT_ID}
          redirectUri={REDIRECT_URI}
          // openid, profile, email — current LinkedIn OIDC scopes
          scopes={['openid', 'profile', 'email']}
          // ✅ Key security prop: get the auth CODE only, not the access token.
          // The clientSecret stays on the server; the device never sees it.
          shouldGetAccessToken={false}
          onSuccess={handleSuccess}
          onError={handleError}
          renderButton={() => null}
          renderClose={() => null}
          containerStyle={styles.webViewContainer}
          wrapperStyle={styles.webViewWrapper}
          closeStyle={styles.hidden}
        />

        <ActivityIndicator
          style={StyleSheet.absoluteFill}
          size="large"
          color="#0077B5"
          pointerEvents="none"
        />
      </SafeAreaView>
    </Modal>
  );
}

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
  webViewContainer: { flex: 1 },
  webViewWrapper: { flex: 1 },
  hidden: { display: 'none' },
});
