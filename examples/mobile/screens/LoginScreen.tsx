/**
 * LoginScreen.tsx
 *
 * Shows all sign-in options:
 *  - Continue with Email (OTP — always works, no 3rd-party config needed)
 *  - Continue with LinkedIn (WebView OAuth)
 *  - Continue with Google  (native SDK, iOS + Android)
 *  - Continue with Apple   (iOS 13+ only)
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  SafeAreaView,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParams } from '../navigation/RootNavigator';
import { useAuth } from '../auth/AuthContext';
import { SocialAuthButtons } from '../SocialAuthButtons';
import type { AppUser } from '../linkedInApi';
import type { StoredUser } from '../auth/sessionStore';

type Props = NativeStackScreenProps<AuthStackParams, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const { signIn } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleSuccess = async (user: AppUser, accessToken: string) => {
    setLoading(true);
    try {
      const storedUser: StoredUser = {
        id: user.id,
        fullName: user.fullName ?? (user as unknown as Record<string,string>).full_name ?? '',
        email: user.email,
        avatarUrl: user.avatarUrl ?? (user as unknown as Record<string,string>).avatar_url ?? null,
        role: (user.role as StoredUser['role']) ?? 'USER',
        status: (user.status as StoredUser['status']) ?? 'PENDING_APPROVAL',
      };
      await signIn(accessToken, storedUser);
    } catch {
      Alert.alert('Error', 'Could not save your session. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleError = (err: Error) => {
    Alert.alert('Sign in failed', err.message);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logo}>TEDx Pune</Text>
          <Text style={styles.tagline}>Ideas worth spreading</Text>
        </View>

        {/* Auth options */}
        <View style={styles.authSection}>
          {loading ? (
            <ActivityIndicator size="large" color="#E62B1E" />
          ) : (
            <>
              {/* ── Email OTP — primary / always works ── */}
              <TouchableOpacity
                style={styles.emailBtn}
                onPress={() => navigation.navigate('EmailLogin')}
                activeOpacity={0.85}
              >
                <Text style={styles.emailBtnText}>✉️  Continue with Email</Text>
              </TouchableOpacity>

              {/* ── Divider ── */}
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* ── LinkedIn / Google / Apple ── */}
              <SocialAuthButtons
                onSuccess={handleSuccess}
                onError={handleError}
              />
            </>
          )}
        </View>

        <Text style={styles.terms}>
          By signing in you agree to our Terms of Service and Privacy Policy.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  container: {
    flex: 1,
    paddingHorizontal: 28,
    paddingVertical: 40,
    justifyContent: 'space-between',
  },
  header: { alignItems: 'center', gap: 8, marginTop: 40 },
  logo: { fontSize: 32, fontWeight: '800', color: '#E62B1E', letterSpacing: -0.5 },
  tagline: { fontSize: 15, color: '#888' },

  authSection: { gap: 14 },

  emailBtn: {
    height: 54,
    borderRadius: 12,
    backgroundColor: '#E62B1E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emailBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#eee' },
  dividerText: { fontSize: 13, color: '#bbb' },

  terms: { fontSize: 11, color: '#bbb', textAlign: 'center', lineHeight: 16 },
});
