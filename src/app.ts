import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { supabasePlugin } from './plugins/supabase';
import { jwtPlugin } from './plugins/jwt';
import { supabaseAuthPlugin } from './plugins/supabase-auth.plugin';
import { authRoutes } from './modules/auth/auth.routes';
import { usersRoutes } from './modules/users/users.routes';
import { postsRoutes } from './modules/posts/posts.routes';
import { adminRoutes } from './modules/admin/admin.routes';
import { videosRoutes } from './modules/videos/videos.routes';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
      transport:
        process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
          : undefined,
    },
  });

  await app.register(cors, { origin: true });

  await app.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
  });

  await app.register(swagger, {
    openapi: {
      info: { title: 'TEDx Pune API', version: '1.0.0', description: 'TEDx Pune Community App API' },
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
  });

  await app.register(supabasePlugin);
  await app.register(jwtPlugin);
  await app.register(supabaseAuthPlugin);

  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(usersRoutes, { prefix: '/api/v1/users' });
  await app.register(postsRoutes, { prefix: '/api/v1/posts' });
  await app.register(adminRoutes, { prefix: '/api/v1/admin' });
  await app.register(videosRoutes, { prefix: '/api/v1/videos' });
  // Also mount under /api/v1/admin/videos so /admin/videos/playlists works
  await app.register(videosRoutes, { prefix: '/api/v1/admin/videos' });

  // ── Prefix-less shims ──────────────────────────────────────────────────────
  // Mobile app calls /posts, /users, /admin, /auth/* without the /api/v1 prefix.
  // These shims forward every request transparently so both paths always work.

  const shimRoutes: Array<{ method: 'GET' | 'POST' | 'PATCH' | 'DELETE'; path: string }> = [
    // auth
    { method: 'GET',    path: '/auth/linkedin' },
    { method: 'POST',   path: '/auth/linkedin/exchange' },
    { method: 'GET',    path: '/auth/linkedin/callback' },
    { method: 'POST',   path: '/auth/apple/exchange' },
    { method: 'POST',   path: '/auth/exchange' },
    { method: 'POST',   path: '/auth/login' },
    { method: 'POST',   path: '/auth/admin/login' },
    { method: 'GET',    path: '/auth/me' },
    // posts
    { method: 'GET',    path: '/posts' },
    { method: 'POST',   path: '/posts' },
    { method: 'DELETE', path: '/posts/:id' },
    { method: 'POST',   path: '/posts/:id/likes' },
    { method: 'DELETE', path: '/posts/:id/likes' },
    { method: 'GET',    path: '/posts/:id/comments' },
    { method: 'POST',   path: '/posts/:id/comments' },
    // users
    { method: 'GET',    path: '/users' },
    { method: 'GET',    path: '/users/me' },
    { method: 'PATCH',  path: '/users/me' },
    { method: 'GET',    path: '/users/:id' },
    // admin
    // videos
    { method: 'GET',    path: '/videos/playlists' },
    { method: 'GET',    path: '/videos/playlists/:id/videos' },
    { method: 'GET',    path: '/videos/videos/:videoId' },
    { method: 'GET',    path: '/videos/admin/playlists' },
    { method: 'POST',   path: '/videos/admin/playlists' },
    { method: 'PATCH',  path: '/videos/admin/playlists/:id' },
    { method: 'DELETE', path: '/videos/admin/playlists/:id' },
    { method: 'POST',   path: '/videos/admin/playlists/sync' },
    { method: 'POST',   path: '/videos/sync' },
    // admin (and admin videos shims)
    { method: 'GET',    path: '/admin/videos/playlists' },
    { method: 'POST',   path: '/admin/videos/playlists' },
    { method: 'PATCH',  path: '/admin/videos/playlists/:id' },
    { method: 'DELETE', path: '/admin/videos/playlists/:id' },
    { method: 'POST',   path: '/admin/videos/playlists/sync' },
    { method: 'GET',    path: '/admin/users' },
    { method: 'PATCH',  path: '/admin/users/:id/status' },
    { method: 'GET',    path: '/admin/posts' },
    { method: 'DELETE', path: '/admin/posts/:id' },
    { method: 'GET',    path: '/admin/metrics' },
  ];

  for (const { method, path } of shimRoutes) {
    const handler = async (
      req: { params: Record<string, string>; query: Record<string, string>; body: unknown; headers: Record<string, string>; raw: { method: string } },
      reply: { redirect: (code: number, url: string) => unknown }
    ) => {
      // Rewrite path params back into the URL
      let resolved = `/api/v1${path}`;
      for (const [k, v] of Object.entries(req.params ?? {})) {
        resolved = resolved.replace(`:${k}`, encodeURIComponent(v));
      }
      const qs = new URLSearchParams(req.query as Record<string, string>).toString();
      return reply.redirect(307, `${resolved}${qs ? `?${qs}` : ''}`);
    };

    (app as unknown as Record<string, (path: string, opts: object, handler: unknown) => void>)[
      method.toLowerCase()
    ](path, { schema: { hide: true } }, handler);
  }

  // Google — forward to Supabase OAuth directly
  app.get<{ Querystring: Record<string, string> }>(
    '/auth/google',
    { schema: { hide: true } },
    async (req, reply) => {
      const redirectTo = req.query.redirect_uri ?? req.query.redirect_to;
      const qs = redirectTo ? `&redirect_to=${encodeURIComponent(redirectTo)}` : '';
      return reply.redirect(302, `${process.env.SUPABASE_URL}/auth/v1/authorize?provider=google${qs}`);
    },
  );

  app.get('/health', { schema: { hide: true } }, async () => ({ status: 'ok' }));

  return app;
}
