/**
 * videos.routes.ts
 *
 * Routes:
 *   Public (authenticated):
 *     GET  /playlists                   — active playlists sorted by display_order
 *     GET  /playlists/:id/videos        — paginated videos for a playlist
 *     GET  /videos/:videoId             — single video detail
 *
 *   Admin:
 *     GET    /admin/playlists           — all playlists (including inactive)
 *     POST   /admin/playlists           — create playlist
 *     PATCH  /admin/playlists/:id       — update playlist
 *     DELETE /admin/playlists/:id       — delete playlist
 *     POST   /admin/playlists/sync      — trigger manual sync
 *     POST   /admin/playlists/:id/sync  — sync single playlist
 *
 *   Cron (internal):
 *     POST /sync                        — called by cron job every 30 min
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import { VideosService } from './videos.service';

function fail(reply: FastifyReply, err: unknown, fallbackCode = 500) {
  const message = err instanceof Error ? err.message : 'Internal error';
  const code = (err as { statusCode?: number }).statusCode ?? fallbackCode;
  return reply.code(code).send({ error: message });
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const playlistPublicSchema = {
  type: 'object' as const,
  properties: {
    id:             { type: 'string' as const },
    playlist_name:  { type: 'string' as const },
    category:       { type: 'string' as const },
    thumbnail_url:  { type: 'string' as const, nullable: true },
    display_order:  { type: 'integer' as const },
  },
};

const playlistFullSchema = {
  type: 'object' as const,
  properties: {
    id:             { type: 'string' as const },
    playlist_name:  { type: 'string' as const },
    playlist_id:    { type: 'string' as const },
    playlist_url:   { type: 'string' as const, nullable: true },
    category:       { type: 'string' as const },
    thumbnail_url:  { type: 'string' as const, nullable: true },
    display_order:  { type: 'integer' as const },
    is_active:      { type: 'boolean' as const },
    created_at:     { type: 'string' as const },
    updated_at:     { type: 'string' as const },
  },
};

const videoSchema = {
  type: 'object' as const,
  properties: {
    id:                { type: 'string' as const },
    youtube_video_id:  { type: 'string' as const },
    title:             { type: 'string' as const },
    description:       { type: 'string' as const, nullable: true },
    thumbnail_url:     { type: 'string' as const, nullable: true },
    video_url:         { type: 'string' as const },
    published_at:      { type: 'string' as const, nullable: true },
    duration:          { type: 'string' as const, nullable: true },
    is_active:         { type: 'boolean' as const },
  },
};

const SYNC_SECRET = process.env.SYNC_SECRET ?? '';

export async function videosRoutes(fastify: FastifyInstance) {
  const svc = new VideosService(fastify.supabase, fastify.log);

  // ─── Public endpoints ────────────────────────────────────────────────────

  fastify.get(
    '/playlists',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Videos'],
        summary: 'List active playlists',
        security: [{ bearerAuth: [] }],
        response: { 200: { type: 'array', items: playlistPublicSchema } },
      },
    },
    async (req) => svc.listPlaylistsPublic(req.user.tenantId),
  );

  fastify.get<{ Params: { id: string }; Querystring: { page?: string; limit?: string } }>(
    '/playlists/:id/videos',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Videos'],
        summary: 'List videos for a playlist',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
        querystring: {
          type: 'object',
          properties: {
            page:  { type: 'string', default: '1' },
            limit: { type: 'string', default: '20' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              items: { type: 'array', items: videoSchema },
              total: { type: 'integer' },
              page:  { type: 'integer' },
              limit: { type: 'integer' },
            },
          },
        },
      },
    },
    async (req) => {
      const page = Math.max(1, parseInt(req.query.page ?? '1', 10) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit ?? '20', 10) || 20));
      return svc.listVideosByPlaylist(req.user.tenantId, req.params.id, page, limit);
    },
  );

  fastify.get<{ Params: { videoId: string } }>(
    '/videos/:videoId',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Videos'],
        summary: 'Get video details',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { videoId: { type: 'string' } },
          required: ['videoId'],
        },
        response: { 200: videoSchema },
      },
    },
    async (req, reply) => {
      try {
        return await svc.getVideoById(req.user.tenantId, req.params.videoId);
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  // ─── Admin endpoints ─────────────────────────────────────────────────────

  const adminGuard = fastify.authorizeRoles(['ADMIN', 'SUPER_ADMIN']);

  fastify.get(
    '/admin/playlists',
    {
      preHandler: [adminGuard],
      schema: {
        tags: ['Videos - Admin'],
        summary: 'List all playlists (admin)',
        security: [{ bearerAuth: [] }],
        response: { 200: { type: 'array', items: playlistFullSchema } },
      },
    },
    async (req) => svc.listPlaylistsAdmin(req.user.tenantId),
  );

  fastify.post<{
    Body: {
      playlistName: string;
      playlistUrl: string;
      category?: string;
      displayOrder?: number;
      isActive?: boolean;
    };
  }>(
    '/admin/playlists',
    {
      preHandler: [adminGuard],
      schema: {
        tags: ['Videos - Admin'],
        summary: 'Add a YouTube playlist',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['playlistName', 'playlistUrl'],
          properties: {
            playlistName: { type: 'string', minLength: 1 },
            playlistUrl:  { type: 'string', minLength: 1, description: 'YouTube playlist URL or raw playlist ID' },
            category:     { type: 'string' },
            displayOrder: { type: 'integer' },
            isActive:     { type: 'boolean' },
          },
        },
        response: { 201: playlistFullSchema },
      },
    },
    async (req, reply) => {
      try {
        const result = await svc.createPlaylist(req.user.tenantId, req.body);
        return reply.code(201).send(result);
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  fastify.patch<{
    Params: { id: string };
    Body: {
      playlistName?: string;
      playlistUrl?: string;
      category?: string;
      displayOrder?: number;
      isActive?: boolean;
    };
  }>(
    '/admin/playlists/:id',
    {
      preHandler: [adminGuard],
      schema: {
        tags: ['Videos - Admin'],
        summary: 'Update a playlist',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
        body: {
          type: 'object',
          properties: {
            playlistName: { type: 'string' },
            playlistUrl:  { type: 'string' },
            category:     { type: 'string' },
            displayOrder: { type: 'integer' },
            isActive:     { type: 'boolean' },
          },
        },
        response: { 200: playlistFullSchema },
      },
    },
    async (req, reply) => {
      try {
        return await svc.updatePlaylist(req.user.tenantId, req.params.id, req.body);
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    '/admin/playlists/:id',
    {
      preHandler: [adminGuard],
      schema: {
        tags: ['Videos - Admin'],
        summary: 'Delete a playlist and its videos',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
      },
    },
    async (req, reply) => {
      try {
        await svc.deletePlaylist(req.user.tenantId, req.params.id);
        return reply.code(204).send();
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  // ─── Manual sync triggers ─────────────────────────────────────────────────

  fastify.post(
    '/admin/playlists/sync',
    {
      preHandler: [adminGuard],
      schema: {
        tags: ['Videos - Admin'],
        summary: 'Sync all active playlists from YouTube',
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              playlistsSynced: { type: 'integer' },
              videosInserted:  { type: 'integer' },
              videosUpdated:   { type: 'integer' },
            },
          },
        },
      },
    },
    async (req, reply) => {
      try {
        return await svc.syncAllPlaylists(req.user.tenantId);
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  // ─── Cron endpoint (protected by SYNC_SECRET header) ──────────────────────
  //
  // Called every 30 minutes by an external cron (e.g. cron-job.org, Supabase
  // Edge Function, or GitHub Actions). Pass the secret in x-sync-secret header.

  fastify.post<{ Body: { tenantSlug?: string } }>(
    '/sync',
    {
      schema: {
        tags: ['Videos - Sync'],
        summary: 'Cron: sync all playlists (protected by SYNC_SECRET)',
        body: {
          type: 'object',
          properties: {
            tenantSlug: { type: 'string', description: 'Defaults to DEFAULT_TENANT_SLUG' },
          },
        },
      },
    },
    async (req, reply) => {
      // Verify sync secret
      const secret = req.headers['x-sync-secret'] as string | undefined;
      if (!SYNC_SECRET || secret !== SYNC_SECRET) {
        return reply.code(401).send({ error: 'Invalid or missing x-sync-secret header' });
      }

      try {
        const slug = req.body?.tenantSlug ?? process.env.DEFAULT_TENANT_SLUG ?? 'tedxpune';
        const { data: tenant } = await fastify.supabase
          .from('tenants')
          .select('id')
          .eq('slug', slug)
          .eq('is_active', true)
          .single();

        if (!tenant) return reply.code(404).send({ error: `Tenant '${slug}' not found` });

        const result = await svc.syncAllPlaylists(tenant.id as string);
        return result;
      } catch (err) {
        return fail(reply, err);
      }
    },
  );
}
