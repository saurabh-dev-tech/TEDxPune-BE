/**
 * EmailLoginScreen.tsx
 *
 * Step 1 of email auth — user enters their email address.
 * On submit → sends OTP → navigates to OTPScreen.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  SafeAreaView,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParams } from '../navigation/RootNavigator';
import { sendEmailOtp } from '../auth/emailAuth';

type Props = NativeStackScreenProps<AuthStackParams, 'EmailLogin'>;

export function EmailLoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const handleSendOtp = async () => {
    if (!isValidEmail) return;
    setLoading(true);
    try {
      await sendEmailOtp(email);
      // Navigate to OTP screen, passing the email so we can verify later
      navigation.navigate('OTPVerify', { email: email.trim().toLowerCase() });
    } catch (err: unknown) {
      Alert.alert(
        'Failed to send code',
        err instanceof Error ? err.message : 'Please try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.container}>

          {/* Back */}
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Enter your email</Text>
            <Text style={styles.subtitle}>
              We'll send a 6-digit code to sign you in — no password needed.
            </Text>
          </View>

          {/* Input */}
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor="#aaa"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            returnKeyType="send"
            onSubmitEditing={handleSendOtp}
          />

          {/* Submit */}
          <TouchableOpacity
            style={[styles.btn, (!isValidEmail || loading) && styles.btnDisabled]}
            onPress={handleSendOtp}
            disabled={!isValidEmail || loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Send Code</Text>
            )}
          </TouchableOpacity>

        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  flex: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 28, paddingTop: 16, gap: 20 },
  backBtn: { paddingVertical: 8, alignSelf: 'flex-start' },
  backText: { fontSize: 16, color: '#E62B1E' },
  header: { gap: 8, marginTop: 12 },
  title: { fontSize: 26, fontWeight: '700', color: '#1a1a1a' },
  subtitle: { fontSize: 15, color: '#666', lineHeight: 22 },
  input: {
    height: 54,
    borderWidth: 1.5,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#1a1a1a',
    backgroundColor: '#fafafa',
  },
  btn: {
    height: 54,
    backgroundColor: '#E62B1E',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { backgroundColor: '#f0a09a' },
  btnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
