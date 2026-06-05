/**
 * LoginScreen.tsx
 *
 * Example screen that wires together the hook + modal.
 * Shows how the full flow looks from a screen's perspective.
 */

import React, { useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Image,
} from 'react-native';
import { useLinkedInAuth } from './useLinkedInAuth';
import { LinkedInWebViewModal } from './LinkedInWebViewModal';
// Or use the react-native-linkedin variant:
// import { LinkedInAuth } from './LinkedInAuth';

export function LoginScreen() {
  const {
    isAuthenticated,
    isLoading,
    user,
    error,
    showLogin,
    openLogin,
    closeLogin,
    onLoginSuccess,
    onLoginError,
    logout,
    restoreSession,
  } = useLinkedInAuth();

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0077B5" />
      </View>
    );
  }

  if (isAuthenticated && user) {
    return (
      <View style={styles.center}>
        {user.avatarUrl ? (
          <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
        ) : null}
        <Text style={styles.name}>{user.fullName}</Text>
        <Text style={styles.email}>{user.email}</Text>
        <Text style={styles.status}>Status: {user.status}</Text>
        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Text style={styles.logoutText}>Log out</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.center}>
      <Text style={styles.heading}>TEDx Pune Community</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity style={styles.linkedInBtn} onPress={openLogin}>
        <Text style={styles.linkedInText}>Continue with LinkedIn</Text>
      </TouchableOpacity>

      <LinkedInWebViewModal
        visible={showLogin}
        onSuccess={onLoginSuccess}
        onError={onLoginError}
        onCancel={closeLogin}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  heading: { fontSize: 24, fontWeight: '700', marginBottom: 32, color: '#000' },
  avatar: { width: 80, height: 80, borderRadius: 40, marginBottom: 16 },
  name: { fontSize: 20, fontWeight: '600', color: '#000' },
  email: { fontSize: 14, color: '#555', marginTop: 4 },
  status: { fontSize: 12, color: '#888', marginTop: 4, marginBottom: 24 },
  linkedInBtn: {
    backgroundColor: '#0077B5',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 8,
  },
  linkedInText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  logoutBtn: { marginTop: 16, padding: 12 },
  logoutText: { color: '#E63946', fontSize: 16 },
  error: { color: '#E63946', marginBottom: 16, textAlign: 'center', fontSize: 14 },
});
