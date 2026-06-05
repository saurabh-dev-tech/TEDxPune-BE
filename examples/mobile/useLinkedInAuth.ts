/**
 * useLinkedInAuth.ts
 *
 * Hook that manages the full LinkedIn OAuth lifecycle for a React Native screen.
 * Stores the JWT in SecureStore (Expo) or Keychain so it survives app restarts.
 *
 * Install:
 *   expo install expo-secure-store
 *   (or: npm install react-native-keychain)
 */

import { useState, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';  // swap for react-native-keychain if not using Expo
import { AppUser } from './linkedInApi';

const TOKEN_KEY = 'tedxpune_access_token';
const USER_KEY = 'tedxpune_user';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AppUser | null;
  accessToken: string | null;
  error: string | null;
}

interface UseLinkedInAuth extends AuthState {
  showLogin: boolean;
  openLogin: () => void;
  closeLogin: () => void;
  onLoginSuccess: (user: AppUser, accessToken: string) => Promise<void>;
  onLoginError: (error: Error) => void;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
}

export function useLinkedInAuth(): UseLinkedInAuth {
  const [showLogin, setShowLogin] = useState(false);
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: false,
    user: null,
    accessToken: null,
    error: null,
  });

  const openLogin = useCallback(() => {
    setState((s) => ({ ...s, error: null }));
    setShowLogin(true);
  }, []);

  const closeLogin = useCallback(() => setShowLogin(false), []);

  const onLoginSuccess = useCallback(async (user: AppUser, accessToken: string) => {
    setShowLogin(false);

    await SecureStore.setItemAsync(TOKEN_KEY, accessToken);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));

    setState({
      isAuthenticated: true,
      isLoading: false,
      user,
      accessToken,
      error: null,
    });
  }, []);

  const onLoginError = useCallback((error: Error) => {
    setShowLogin(false);
    setState((s) => ({ ...s, isLoading: false, error: error.message }));
  }, []);

  const logout = useCallback(async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
    setState({ isAuthenticated: false, isLoading: false, user: null, accessToken: null, error: null });
  }, []);

  /** Call once on app startup to rehydrate session from secure storage */
  const restoreSession = useCallback(async () => {
    setState((s) => ({ ...s, isLoading: true }));
    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      const userJson = await SecureStore.getItemAsync(USER_KEY);
      if (token && userJson) {
        setState({
          isAuthenticated: true,
          isLoading: false,
          user: JSON.parse(userJson) as AppUser,
          accessToken: token,
          error: null,
        });
      } else {
        setState((s) => ({ ...s, isLoading: false }));
      }
    } catch {
      setState((s) => ({ ...s, isLoading: false }));
    }
  }, []);

  return {
    ...state,
    showLogin,
    openLogin,
    closeLogin,
    onLoginSuccess,
    onLoginError,
    logout,
    restoreSession,
  };
}
