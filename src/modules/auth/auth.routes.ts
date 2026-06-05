/**
 * auth.routes.ts
 *
 * Auth strategy per provider:
 *
 *  GOOGLE  → Supabase Auth handles everything. Mobile uses supabase.auth.signInWithIdToken().
 *             No backend routes needed. Supabase issues the JWT; backend just verifies it
 *             via supabaseAuthPlugin (SUPABASE_JWT_SECRET).
 *
 *  APPLE   → Same as Google — Supabase Auth handles it via signInWithIdToken().
 *             No backend routes needed.
 *
 *  LINKEDIN → Supabase does NOT officially support LinkedIn OIDC yet, so we
 *             keep the custom WebView + code-exchange flow here.
 *
 *  SESSION  → GET /me returns the decoded Supabase JWT payload for any provider.
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import { AuthService } from './auth.service';
import { buildLinkedInAuthUrl, exchangeLinkedInCode } from './providers/linkedin.service';

function fail(reply: FastifyReply, err: unknown, code = 401) {
  const message = err instanceof Error ? err.message : 'Authentication failed';
  return reply.code(code).send({ error: message });
}

export async function authRoutes(fastify: FastifyInstance) {
  const svc = new AuthService(fastify.supabase, fastify);

  // ─── LinkedIn (custom flow — Supabase doesn't support LinkedIn OIDC natively) ──

  fastify.get<{ Querystring: { redirect_uri?: string } }>(
    '/linkedin',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Initiate LinkedIn OAuth (web / mobile WebView)',
        querystring: {
          type: 'object',
          properties: {
            redirect_uri: { type: 'string', description: 'e.g. tedxpune://auth/callback' },
          },
        },
      },
    },
    async (req, reply) => reply.redirect(302, buildLinkedInAuthUrl(req.query.redirect_uri)),
  );

  fastify.get<{ Querystring: { code?: string; error?: string } }>(
    '/linkedin/callback',
    { schema: { tags: ['Auth'], summary: 'LinkedIn web callback' } },
    async (req, reply) => {
      const { code, error } = req.query;
      if (error || !code) return reply.code(401).send({ error: 'LinkedIn auth failed' });
      try {
        const profile = await exchangeLinkedInCode(code);
        const accessToken = await svc.findOrCreateUser(profile);
        return { accessToken };
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  fastify.post<{ Body: { code: string; redirectUri?: string } }>(
    '/linkedin/exchange',
    {
      schema: {
        tags: ['Auth'],
        summary: 'LinkedIn mobile — exchange auth code for app JWT',
        body: {
          type: 'object',
          required: ['code'],
          properties: {
            code: { type: 'string' },
            redirectUri: { type: 'string' },
          },
        },
      },
    },
    async (req, reply) => {
      const mobileUri = req.body.redirectUri ?? process.env.LINKEDIN_MOBILE_REDIRECT_URI;
      if (!mobileUri) return reply.code(500).send({ error: 'LINKEDIN_MOBILE_REDIRECT_URI not set' });
      try {
        const profile = await exchangeLinkedInCode(req.body.code, mobileUri);
        return await svc.findOrCreateUserWithProfile(profile);
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  // ─── Supabase token exchange (email OTP / Google / Apple via Supabase SDK) ────
  //
  // Any auth flow that goes through Supabase (email OTP, Supabase Google/Apple)
  // produces a Supabase JWT. This endpoint converts it into our backend JWT so
  // all existing routes (/users/me, /posts, etc.) work without modification.
  //
  // Mobile flow:
  //   supabase.auth.signInWithOtp() or signInWithIdToken()
  //   → POST /auth/exchange { supabaseToken: session.access_token }
  //   → { accessToken, user }  ← backend JWT, store this in SecureStore

  fastify.post<{ Body: { supabaseToken: string } }>(
    '/exchange',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Exchange a Supabase token for a backend JWT',
        description:
          'Used after email OTP, Google, or Apple sign-in via Supabase SDK. ' +
          'Verifies the Supabase token, upserts the user in public.users, and returns our signed JWT.',
        body: {
          type: 'object',
          required: ['supabaseToken'],
          properties: {
            supabaseToken: {
              type: 'string',
              description: 'session.access_token from supabase.auth.signInWithOtp() or signInWithIdToken()',
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              accessToken: { type: 'string' },
              user: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  fullName: { type: 'string' },
                  email: { type: 'string' },
                  avatarUrl: { type: 'string', nullable: true },
                  role: { type: 'string' },
                  status: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (req, reply) => {
      try {
        return await svc.exchangeSupabaseToken(req.body.supabaseToken);
      } catch (err) {
        fastify.log.error({ err, tokenPrefix: req.body.supabaseToken?.slice(0, 20) }, '[auth/exchange] failed');
        return fail(reply, err, (err as { statusCode?: number }).statusCode ?? 401);
      }
    },
  );

  // ─── Admin login (email + password) ──────────────────────────────────────────
  //     Available at both /auth/login and /auth/admin/login

  const adminLoginHandler = async (
    req: { body: { email: string; password: string } },
    reply: FastifyReply,
  ) => {
    try {
      return await svc.adminLogin(req.body.email, req.body.password);
    } catch (err) {
      fastify.log.error({ err, email: req.body.email }, '[auth/login] failed');
      return fail(reply, err, (err as { statusCode?: number }).statusCode ?? 401);
    }
  };

  const adminLoginSchema = {
    tags: ['Auth'],
    summary: 'Admin login with email & password',
    description:
      'Authenticates via Supabase Auth (email+password), then verifies ' +
      'the user has ADMIN or SUPER_ADMIN role. Returns a backend JWT.',
    body: {
      type: 'object' as const,
      required: ['email', 'password'],
      properties: {
        email: { type: 'string' as const, format: 'email' },
        password: { type: 'string' as const, minLength: 6 },
      },
    },
    response: {
      200: {
        type: 'object' as const,
        properties: {
          accessToken: { type: 'string' as const },
          user: {
            type: 'object' as const,
            properties: {
              id: { type: 'string' as const },
              fullName: { type: 'string' as const },
              email: { type: 'string' as const },
              avatarUrl: { type: 'string' as const, nullable: true },
              role: { type: 'string' as const },
              status: { type: 'string' as const },
            },
          },
        },
      },
    },
  };

  fastify.post<{ Body: { email: string; password: string } }>(
    '/login',
    { schema: adminLoginSchema },
    adminLoginHandler,
  );

  fastify.post<{ Body: { email: string; password: string } }>(
    '/admin/login',
    { schema: { ...adminLoginSchema, summary: 'Admin login (alias)' } },
    adminLoginHandler,
  );

  // ─── Google & Apple: handled entirely by Supabase Auth SDK on mobile ─────────
  //
  // Mobile flow (no backend route needed):
  //
  //   // Google
  //   const { idToken } = await GoogleSignin.signIn();
  //   const { data } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
  //
  //   // Apple
  //   const { identityToken } = await AppleAuthentication.signInAsync(...);
  //   const { data } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: identityToken });
  //
  //   // Then use data.session.access_token as Bearer token for all API calls.
  //   // Backend verifies it with SUPABASE_JWT_SECRET — no Google/Apple credentials needed.

  // ─── Session — works for ALL providers (LinkedIn custom JWT + Supabase JWT) ───

  fastify.get(
    '/me',
    {
      preHandler: [fastify.requireAuth],
      schema: {
        tags: ['Auth'],
        summary: 'Get current user — works for LinkedIn, Google and Apple sessions',
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              supabaseUid: { type: 'string' },
              email: { type: 'string' },
              fullName: { type: 'string' },
              avatarUrl: { type: 'string', nullable: true },
              role: { type: 'string' },
              status: { type: 'string' },
              tenantId: { type: 'string' },
            },
          },
        },
      },
    },
    async (req) => req.appUser,
  );
}
