/**
 * AuthContext.tsx
 *
 * Global auth state for the app.
 *
 * - Restores session from SecureStore on cold launch
 * - Exposes signIn / signOut to any screen
 * - RootNavigator reads `status` to decide which stack to show
 *
 * Wrap your entire app with <AuthProvider> in App.tsx:
 *
 *   export default function App() {
 *     return (
 *       <AuthProvider>
 *         <RootNavigator />
 *       </AuthProvider>
 *     );
 *   }
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
} from 'react';
import {
  saveSession,
  clearSession,
  getSession,
  type StoredUser,
} from './sessionStore';

// ─── State shape ──────────────────────────────────────────────────────────────

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  status: AuthStatus;
  accessToken: string | null;
  user: StoredUser | null;
}

type AuthAction =
  | { type: 'RESTORE'; payload: { accessToken: string; user: StoredUser } | null }
  | { type: 'SIGN_IN'; payload: { accessToken: string; user: StoredUser } }
  | { type: 'SIGN_OUT' };

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'RESTORE':
      return {
        status: action.payload ? 'authenticated' : 'unauthenticated',
        accessToken: action.payload?.accessToken ?? null,
        user: action.payload?.user ?? null,
      };
    case 'SIGN_IN':
      return {
        status: 'authenticated',
        accessToken: action.payload.accessToken,
        user: action.payload.user,
      };
    case 'SIGN_OUT':
      return { status: 'unauthenticated', accessToken: null, user: null };
    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface AuthContextValue extends AuthState {
  signIn: (accessToken: string, user: StoredUser) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, {
    status: 'loading',
    accessToken: null,
    user: null,
  });

  // Restore persisted session on app launch
  useEffect(() => {
    getSession()
      .then((session) => dispatch({ type: 'RESTORE', payload: session }))
      .catch(() => dispatch({ type: 'RESTORE', payload: null }));
  }, []);

  const signIn = useCallback(async (accessToken: string, user: StoredUser) => {
    await saveSession(accessToken, user);
    dispatch({ type: 'SIGN_IN', payload: { accessToken, user } });
  }, []);

  const signOut = useCallback(async () => {
    await clearSession();
    dispatch({ type: 'SIGN_OUT' });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
