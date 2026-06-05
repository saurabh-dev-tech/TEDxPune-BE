/**
 * App.tsx — root entry point
 *
 * Install navigation deps:
 *   npm install @react-navigation/native @react-navigation/native-stack
 *   expo install react-native-screens react-native-safe-area-context
 *   expo install expo-secure-store
 */

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { AuthProvider } from './auth/AuthContext';
import { RootNavigator } from './navigation/RootNavigator';
import { configureGoogleSignIn } from './GoogleSignIn';

// Configure Google Sign-In once at app startup
configureGoogleSignIn();

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
    </AuthProvider>
  );
}
