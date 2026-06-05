/**
 * supabase-auth.plugin.ts
 *
 * Fastify authentication plugin that validates Supabase-issued JWTs.
 *
 * TWO verification strategies (choose via SUPABASE_JWT_VERIFY_MODE env var):
 *
 *   "local"  (default, recommended for production)
 *     — Verifies the JWT signature locally using SUPABASE_JWT_SECRET.
 *     — Zero network calls, sub-millisecond, works offline.
 *     — Secret is in Supabase Dashboard → Settings → API → JWT Secret.
 *
 *   "remote"
 *     — Calls supabase.auth.getUser(token) on every request.
 *     — Easier setup (no JWT secret needed), but adds ~50-200 ms latency.
 *     — Use this during local development if you don't have the secret handy.
 *
 * After verification, two decorators are available on every request:
 *
 *   request.supabaseUser   — raw Supabase User object  { id, email, ... }
 *   request.appUser        — our public.users row       { id, role, status, tenantId, ... }
 *
 * Usage — protect a route:
 *
 *   fastify.get('/protected', { preHandler: [fastify.requireAuth] }, handler)
 *
 * Usage — protect all routes in a scope:
 *
 *   fastify.addHook('preHandler', fastify.requireAuth)
 */

import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createClient, type User } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AppUser {
  id: string;               // public.users.id (our UUID)
  supabaseUid: string;      // auth.users.id
  tenantId: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  role: 'USER' | 'ADMIN' | 'SUPER_ADMIN';
  status: 'PENDING_APPROVAL' | 'ACTIVE' | 'BLOCKED';
}

interface SupabaseJwtPayload {
  sub: string;              // Supabase user UUID
  email?: string;
  role?: string;
  aud?: string;
  exp?: number;
  iat?: number;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
}

// ─── Module augmentation ──────────────────────────────────────────────────────

declare module 'fastify' {
  interface FastifyInstance {
    requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    supabaseUser: User | null;
    appUser: AppUser | null;
  }
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

async function supabaseAuthPluginFn(fastify: FastifyInstance) {
  const {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_JWT_SECRET,
    SUPABASE_JWT_VERIFY_MODE = 'local',
  } = process.env;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }
  // If JWT secret is missing, fall back to remote verification automatically
  const verifyMode =
    SUPABASE_JWT_VERIFY_MODE === 'local' && !SUPABASE_JWT_SECRET
      ? 'remote'
      : (SUPABASE_JWT_VERIFY_MODE as 'local' | 'remote');

  if (SUPABASE_JWT_VERIFY_MODE === 'local' && !SUPABASE_JWT_SECRET) {
    fastify.log.warn(
      '[supabase-auth] SUPABASE_JWT_SECRET not set — falling back to remote verification.\n' +
      '  To enable fast local verification:\n' +
      '  1. Go to Supabase Dashboard → Settings → API → JWT Secret\n' +
      '  2. Add SUPABASE_JWT_SECRET=<secret> to your .env\n' +
      '  3. Set SUPABASE_JWT_VERIFY_MODE=local',
    );
  }

  // Service-role client — only used for DB lookups, never exposed to clients
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── Decorate request with null defaults ────────────────────────────────────
  fastify.decorateRequest('supabaseUser', null);
  fastify.decorateRequest('appUser', null);

  // ── Core token extractor ───────────────────────────────────────────────────
  async function extractAndVerifyToken(
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<string | null> {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      reply.code(401).send({ error: 'Missing Authorization header' });
      return null;
    }
    if (!authHeader.startsWith('Bearer ')) {
      reply.code(401).send({ error: 'Authorization header must use Bearer scheme' });
      return null;
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      reply.code(401).send({ error: 'Bearer token is empty' });
      return null;
    }

    return token;
  }

  // ── Strategy: local JWT verification ──────────────────────────────────────
  async function verifyLocal(token: string): Promise<SupabaseJwtPayload> {
    return new Promise((resolve, reject) => {
      jwt.verify(
        token,
        SUPABASE_JWT_SECRET!,
        { audience: 'authenticated', algorithms: ['HS256'] },
        (err, decoded) => {
          if (err) {
            fastify.log.warn({ err: err.message }, 'JWT local verification failed');
            reject(err);
          } else {
            resolve(decoded as SupabaseJwtPayload);
          }
        },
      );
    });
  }

  // ── Strategy: remote verification via Supabase Auth API ───────────────────
  async function verifyRemote(token: string): Promise<User> {
    const { data, error } = await adminClient.auth.getUser(token);
    if (error || !data.user) {
      fastify.log.warn({ error: error?.message }, 'Supabase remote token verification failed');
      throw new Error(error?.message ?? 'Invalid token');
    }
    return data.user;
  }

  // ── Lookup our custom user row ─────────────────────────────────────────────
  async function fetchAppUser(supabaseUid: string): Promise<AppUser | null> {
    const { data, error } = await adminClient
      .from('users')
      .select('id, supabase_uid, tenant_id, email, full_name, avatar_url, role, status')
      .eq('supabase_uid', supabaseUid)
      .single();

    if (error) {
      fastify.log.warn({ supabaseUid, error: error.message }, 'appUser lookup failed');
      return null;
    }

    return {
      id: data.id as string,
      supabaseUid: data.supabase_uid as string,
      tenantId: data.tenant_id as string,
      email: data.email as string,
      fullName: data.full_name as string,
      avatarUrl: (data.avatar_url as string) ?? null,
      role: data.role as AppUser['role'],
      status: data.status as AppUser['status'],
    };
  }

  // ── requireAuth hook (attach to individual routes or scopes) ──────────────
  const requireAuth = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const token = await extractAndVerifyToken(req, reply);
    if (!token) return; // reply already sent

    let supabaseUid: string;

    try {
      if (verifyMode === 'remote') {
        const user = await verifyRemote(token);
        req.supabaseUser = user;
        supabaseUid = user.id;
      } else {
        const payload = await verifyLocal(token);
        supabaseUid = payload.sub;
        // Construct a lightweight User-like object without a round-trip
        req.supabaseUser = {
          id: payload.sub,
          email: payload.email ?? '',
          app_metadata: payload.app_metadata ?? {},
          user_metadata: payload.user_metadata ?? {},
          aud: payload.aud ?? 'authenticated',
          created_at: '',
        } as User;
      }
    } catch {
      reply.code(401).send({ error: 'Invalid or expired token' });
      return;
    }

    // Fetch our app-level user (role, tenantId, status, etc.)
    const appUser = await fetchAppUser(supabaseUid);

    if (!appUser) {
      // Edge case: Supabase auth succeeded but our trigger hasn't run yet
      // (can happen within the same transaction). Return 401 to force retry.
      fastify.log.warn({ supabaseUid }, 'Authenticated Supabase user has no app profile yet');
      reply.code(401).send({ error: 'User profile not found. Please try again.' });
      return;
    }

    if (appUser.status === 'BLOCKED') {
      reply.code(403).send({ error: 'Your account has been suspended.' });
      return;
    }

    req.appUser = appUser;
  };

  fastify.decorate('requireAuth', requireAuth);

  fastify.log.info(`[supabase-auth] Verification mode: ${verifyMode}`);
}

export const supabaseAuthPlugin = fp(supabaseAuthPluginFn, {
  name: 'supabase-auth',
  dependencies: ['supabase'],  // our existing supabase plugin must load first
});
