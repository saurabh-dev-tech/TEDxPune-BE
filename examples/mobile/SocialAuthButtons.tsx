/**
 * SocialAuthButtons.tsx
 *
 * Drop-in component that renders LinkedIn + Google + Apple (iOS only) sign-in buttons.
 * Handles errors internally and calls onSuccess / onError.
 *
 * Usage:
 *   <SocialAuthButtons
 *     onSuccess={(user, token) => saveAndNavigate(user, token)}
 *     onError={(err) => Alert.alert('Sign in failed', err.message)}
 *   />
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';

import { LinkedInWebViewModal } from './LinkedInWebViewModal';
import { signInWithGoogle, isGoogleSignInCancelled, isGooglePlayServicesError } from './GoogleSignIn';
import { signInWithApple, isAppleSignInCancelled } from './AppleSignIn';
import type { AppUser } from './linkedInApi';

interface Props {
  onSuccess: (user: AppUser, accessToken: string) => void;
  onError: (error: Error) => void;
}

type LoadingProvider = 'linkedin' | 'google' | 'apple' | null;

export function SocialAuthButtons({ onSuccess, onError }: Props) {
  const [showLinkedIn, setShowLinkedIn] = useState(false);
  const [loading, setLoading] = useState<LoadingProvider>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
  }, []);

  const handleGooglePress = async () => {
    setLoading('google');
    try {
      const { accessToken, user } = await signInWithGoogle();
      onSuccess(user, accessToken);
    } catch (err: unknown) {
      if (!isGoogleSignInCancelled(err) && !isGooglePlayServicesError(err)) {
        onError(err instanceof Error ? err : new Error('Google sign-in failed'));
      }
    } finally {
      setLoading(null);
    }
  };

  const handleApplePress = async () => {
    setLoading('apple');
    try {
      const { accessToken, user } = await signInWithApple();
      onSuccess(user, accessToken);
    } catch (err: unknown) {
      if (!isAppleSignInCancelled(err)) {
        onError(err instanceof Error ? err : new Error('Apple sign-in failed'));
      }
    } finally {
      setLoading(null);
    }
  };

  const isAnyLoading = loading !== null;

  return (
    <View style={styles.container}>
      {/* ── LinkedIn ── */}
      <TouchableOpacity
        style={[styles.btn, styles.linkedInBtn]}
        onPress={() => setShowLinkedIn(true)}
        disabled={isAnyLoading}
        activeOpacity={0.8}
      >
        {loading === 'linkedin' ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={[styles.btnText, styles.lightText]}>Continue with LinkedIn</Text>
        )}
      </TouchableOpacity>

      {/* ── Google ── */}
      <TouchableOpacity
        style={[styles.btn, styles.googleBtn]}
        onPress={handleGooglePress}
        disabled={isAnyLoading}
        activeOpacity={0.8}
      >
        {loading === 'google' ? (
          <ActivityIndicator color="#444" />
        ) : (
          <Text style={[styles.btnText, styles.darkText]}>Continue with Google</Text>
        )}
      </TouchableOpacity>

      {/* ── Apple (iOS 13+ only) ── */}
      {appleAvailable && Platform.OS === 'ios' && (
        <TouchableOpacity
          style={[styles.btn, styles.appleBtn]}
          onPress={handleApplePress}
          disabled={isAnyLoading}
          activeOpacity={0.8}
        >
          {loading === 'apple' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={[styles.btnText, styles.lightText]}>Continue with Apple</Text>
          )}
        </TouchableOpacity>
      )}

      {/* ── LinkedIn WebView Modal ── */}
      <LinkedInWebViewModal
        visible={showLinkedIn}
        onSuccess={(user, accessToken) => {
          setShowLinkedIn(false);
          onSuccess(user, accessToken);
        }}
        onError={(err) => {
          setShowLinkedIn(false);
          onError(err);
        }}
        onCancel={() => setShowLinkedIn(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  btn: {
    height: 52,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  btnText: { fontSize: 16, fontWeight: '600' },
  lightText: { color: '#fff' },
  darkText: { color: '#1f1f1f' },
  linkedInBtn: { backgroundColor: '#0077B5' },
  googleBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dadce0' },
  appleBtn: { backgroundColor: '#000' },
});
