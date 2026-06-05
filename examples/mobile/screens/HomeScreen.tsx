/**
 * HomeScreen.tsx
 *
 * First screen after successful authentication.
 * Reads user from AuthContext — no async calls needed.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  SafeAreaView,
  Alert,
} from 'react-native';
import { useAuth } from '../auth/AuthContext';

export function HomeScreen() {
  const { user, signOut } = useAuth();

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          // No navigate() needed — RootNavigator switches back to Auth stack automatically
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>

        <View style={styles.profileCard}>
          {user?.avatarUrl ? (
            <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarInitial}>
                {user?.fullName?.[0]?.toUpperCase() ?? '?'}
              </Text>
            </View>
          )}
          <Text style={styles.name}>{user?.fullName}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{user?.role}</Text>
          </View>
          {user?.status === 'PENDING_APPROVAL' && (
            <Text style={styles.pendingNote}>
              ⏳ Your account is pending admin approval.
            </Text>
          )}
        </View>

        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 32,
    justifyContent: 'space-between',
  },
  profileCard: { alignItems: 'center', gap: 10, marginTop: 40 },
  avatar: { width: 88, height: 88, borderRadius: 44, marginBottom: 4 },
  avatarFallback: { backgroundColor: '#E62B1E', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 36, fontWeight: '700', color: '#fff' },
  name: { fontSize: 22, fontWeight: '700', color: '#1a1a1a' },
  email: { fontSize: 14, color: '#888' },
  badge: {
    backgroundColor: '#f3f3f3',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  badgeText: { fontSize: 12, fontWeight: '600', color: '#555' },
  pendingNote: { fontSize: 13, color: '#e67e00', textAlign: 'center', marginTop: 8 },
  signOutBtn: {
    height: 50,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutText: { fontSize: 16, color: '#E62B1E', fontWeight: '600' },
});
