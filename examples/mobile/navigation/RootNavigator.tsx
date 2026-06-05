/**
 * RootNavigator.tsx
 *
 * Auth gate + stack definitions for all screens.
 *
 * Auth stack  (no token):  Login → EmailLogin → OTPVerify
 * App stack   (has token): Home → ...
 */

import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { LoginScreen } from '../screens/LoginScreen';
import { EmailLoginScreen } from '../screens/EmailLoginScreen';
import { OTPScreen } from '../screens/OTPScreen';
import { HomeScreen } from '../screens/HomeScreen';

// ─── Stack param lists ────────────────────────────────────────────────────────

export type AuthStackParams = {
  Login: undefined;
  EmailLogin: undefined;
  OTPVerify: { email: string };
};

export type AppStackParams = {
  Home: undefined;
  // Add more app screens here
};

const AuthStack = createNativeStackNavigator<AuthStackParams>();
const AppStack  = createNativeStackNavigator<AppStackParams>();

// ─── Sub-navigators ───────────────────────────────────────────────────────────

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login"      component={LoginScreen} />
      <AuthStack.Screen name="EmailLogin" component={EmailLoginScreen} />
      <AuthStack.Screen name="OTPVerify"  component={OTPScreen} />
    </AuthStack.Navigator>
  );
}

function AppNavigator() {
  return (
    <AppStack.Navigator screenOptions={{ headerShown: false }}>
      <AppStack.Screen name="Home" component={HomeScreen} />
    </AppStack.Navigator>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export function RootNavigator() {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#E62B1E" />
      </View>
    );
  }

  return status === 'authenticated' ? <AppNavigator /> : <AuthNavigator />;
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
});
