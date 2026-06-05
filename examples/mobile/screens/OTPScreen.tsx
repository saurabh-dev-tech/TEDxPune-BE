/**
 * OTPScreen.tsx
 *
 * Step 2 of email auth — user enters the 6-digit OTP code.
 *
 * Features:
 *  - 6 individual digit boxes (tap any → focuses first empty)
 *  - Auto-submits when all 6 digits are entered
 *  - Resend code with 60-second cooldown
 *  - On success → saves session → AuthContext flips to 'authenticated' → HomeScreen
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParams } from '../navigation/RootNavigator';
import { verifyEmailOtp, resendEmailOtp } from '../auth/emailAuth';
import { useAuth } from '../auth/AuthContext';
import type { StoredUser } from '../auth/sessionStore';

type Props = NativeStackScreenProps<AuthStackParams, 'OTPVerify'>;

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 60; // seconds

export function OTPScreen({ route, navigation }: Props) {
  const { email } = route.params;
  const { signIn } = useAuth();

  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);
  const inputRef = useRef<TextInput>(null);
  // Single hidden input drives all 6 boxes
  const [rawValue, setRawValue] = useState('');

  // Countdown timer for resend
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleChange = useCallback(
    (value: string) => {
      const clean = value.replace(/\D/g, '').slice(0, OTP_LENGTH);
      setRawValue(clean);
      const arr = clean.split('').concat(Array(OTP_LENGTH).fill('')).slice(0, OTP_LENGTH);
      setDigits(arr);

      if (clean.length === OTP_LENGTH) {
        verify(clean);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const verify = async (code: string) => {
    setLoading(true);
    try {
      // verifyEmailOtp now calls /auth/exchange internally and returns our backend JWT
      const { accessToken, user } = await verifyEmailOtp(email, code);

      // Save backend JWT + user → RootNavigator switches to HomeScreen
      await signIn(accessToken, user);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid code. Please try again.';
      Alert.alert('Verification failed', msg);
      // Clear input so user can re-enter
      setRawValue('');
      setDigits(Array(OTP_LENGTH).fill(''));
      inputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    try {
      await resendEmailOtp(email);
      setCooldown(RESEND_COOLDOWN);
      setRawValue('');
      setDigits(Array(OTP_LENGTH).fill(''));
      Alert.alert('Code sent', `A new code was sent to ${email}`);
    } catch (err: unknown) {
      Alert.alert('Failed to resend', err instanceof Error ? err.message : 'Try again.');
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.container}>

          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={styles.title}>Check your email</Text>
            <Text style={styles.subtitle}>
              We sent a 6-digit code to{'\n'}
              <Text style={styles.emailHighlight}>{email}</Text>
            </Text>
          </View>

          {/* OTP boxes — backed by a single hidden TextInput */}
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => inputRef.current?.focus()}
            style={styles.otpRow}
          >
            {digits.map((d, i) => (
              <View
                key={i}
                style={[
                  styles.digitBox,
                  rawValue.length === i && styles.digitBoxActive,
                  d !== '' && styles.digitBoxFilled,
                ]}
              >
                <Text style={styles.digitText}>{d}</Text>
              </View>
            ))}
          </TouchableOpacity>

          {/* Hidden input that collects actual keypresses */}
          <TextInput
            ref={inputRef}
            value={rawValue}
            onChangeText={handleChange}
            keyboardType="number-pad"
            maxLength={OTP_LENGTH}
            autoFocus
            style={styles.hiddenInput}
            caretHidden
          />

          {loading && (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#E62B1E" />
              <Text style={styles.loadingText}>Verifying…</Text>
            </View>
          )}

          {/* Resend */}
          <View style={styles.resendRow}>
            <Text style={styles.resendLabel}>Didn't get the code? </Text>
            {cooldown > 0 ? (
              <Text style={styles.resendCooldown}>Resend in {cooldown}s</Text>
            ) : (
              <TouchableOpacity onPress={handleResend}>
                <Text style={styles.resendLink}>Resend</Text>
              </TouchableOpacity>
            )}
          </View>

        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  flex: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 28, paddingTop: 16, gap: 24 },
  backBtn: { paddingVertical: 8, alignSelf: 'flex-start' },
  backText: { fontSize: 16, color: '#E62B1E' },
  header: { gap: 8, marginTop: 12 },
  title: { fontSize: 26, fontWeight: '700', color: '#1a1a1a' },
  subtitle: { fontSize: 15, color: '#666', lineHeight: 24 },
  emailHighlight: { fontWeight: '600', color: '#1a1a1a' },

  otpRow: { flexDirection: 'row', gap: 10, justifyContent: 'center', marginTop: 8 },
  digitBox: {
    width: 48,
    height: 56,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fafafa',
  },
  digitBoxActive: { borderColor: '#E62B1E', backgroundColor: '#fff' },
  digitBoxFilled: { borderColor: '#1a1a1a', backgroundColor: '#fff' },
  digitText: { fontSize: 22, fontWeight: '700', color: '#1a1a1a' },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    width: 1,
    height: 1,
  },

  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' },
  loadingText: { fontSize: 14, color: '#666' },

  resendRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  resendLabel: { fontSize: 14, color: '#888' },
  resendCooldown: { fontSize: 14, color: '#aaa' },
  resendLink: { fontSize: 14, color: '#E62B1E', fontWeight: '600' },
});
