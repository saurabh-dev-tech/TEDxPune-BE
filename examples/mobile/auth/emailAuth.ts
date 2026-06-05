/**
 * emailAuth.ts
 *
 * Email OTP authentication via Supabase → backend JWT exchange.
 *
 * Full flow:
 *   1. sendOtp(email)           → Supabase emails a 6-digit code
 *   2. verifyEmailOtp(email, code)
 *        a. verifyOtp()         → Supabase returns a Supabase session
 *        b. POST /auth/exchange → backend verifies Supabase token, returns our JWT
 *   3. Store backend JWT in SecureStore — use for all API calls
 *
 * Supabase Dashboard (one-time):
 *   Authentication → Providers → Email → Enable
 *   Authentication → Email Templates → customise with TEDx branding (optional)
 */

import { supabase } from '../supabase/client';
import type { Session } from '@supabase/supabase-js';
import type { StoredUser } from './sessionStore';

const API_BASE = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');

// ─── Step 1: Send OTP ─────────────────────────────────────────────────────────

export async function sendEmailOtp(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { shouldCreateUser: true },
  });
  if (error) throw new Error(error.message);
}

// ─── Step 2: Verify OTP + exchange for backend JWT ───────────────────────────

export interface EmailAuthResult {
  session: Session;       // raw Supabase session
  accessToken: string;    // our backend JWT — use this for all API calls
  user: StoredUser;
  isNewUser: boolean;
}

export async function verifyEmailOtp(
  email: string,
  token: string,
): Promise<EmailAuthResult> {
  // 2a. Verify the OTP code with Supabase
  const { data, error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: token.trim(),
    type: 'email',
  });

  if (error) throw new Error(error.message);
  if (!data.session) throw new Error('Verification succeeded but no session returned.');

  // 2b. Exchange the Supabase JWT for our backend JWT
  //     The backend verifies it with Supabase, upserts public.users, and returns
  //     a JWT signed with our own JWT_SECRET — accepted by all protected routes.
  const res = await fetch(`${API_BASE}/auth/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ supabaseToken: data.session.access_token }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Token exchange failed (HTTP ${res.status})`);
  }

  const { accessToken, user } = await res.json() as {
    accessToken: string;
    user: StoredUser;
  };

  const supabaseUser = data.session.user;
  const isNewUser =
    !!supabaseUser.created_at &&
    !!supabaseUser.last_sign_in_at &&
    Math.abs(
      new Date(supabaseUser.created_at).getTime() -
      new Date(supabaseUser.last_sign_in_at).getTime(),
    ) < 5000;

  return { session: data.session, accessToken, user, isNewUser };
}

// ─── Resend OTP ───────────────────────────────────────────────────────────────

export async function resendEmailOtp(email: string): Promise<void> {
  const { error } = await supabase.auth.resend({
    email: email.trim().toLowerCase(),
    type: 'signup',
  });
  if (error) throw new Error(error.message);
}
