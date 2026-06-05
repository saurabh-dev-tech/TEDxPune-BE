import type { FastifyInstance, FastifyReply } from 'fastify';
import { AdminService } from './admin.service';

type UserStatus = 'PENDING_APPROVAL' | 'ACTIVE' | 'BLOCKED';

const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'] as const;

const authorSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    full_name: { type: 'string' },
    avatar_url: { type: 'string', nullable: true },
    headline: { type: 'string', nullable: true },
  },
};

const pollOptionSchema = {
  type: 'object',
  properties: {
    id:           { type: 'string' },
    option_text:  { type: 'string' },
    sort_order:   { type: 'integer' },
    vote_count:   { type: 'integer' },
  },
};

const postSchema = {
  type: 'object',
  properties: {
    id:          { type: 'string' },
    body:        { type: 'string' },
    post_type:   { type: 'string' },
    image_url:   { type: 'string', nullable: true },
    video_url:   { type: 'string', nullable: true },
    status:      { type: 'string' },
    created_at:  { type: 'string' },
    updated_at:  { type: 'string' },
    kudos_count: { type: 'integer' },
    author:      authorSchema,
    poll_options: { type: 'array', items: pollOptionSchema },
  },
};

function handleServiceError(err: unknown, reply: FastifyReply) {
  const e = err as { statusCode?: number; message: string };
  return reply.code(e.statusCode ?? 500).send({ error: e.message });
}

export async function adminRoutes(fastify: FastifyInstance) {
  const svc = new AdminService(fastify.supabase);

  const adminAuth = fastify.authorizeRoles([...ADMIN_ROLES]);

  fastify.get<{ Querystring: { status?: 'ACTIVE' | 'DELETED'; page?: number; limit?: number; search?: string } }>(
    '/posts',
    {
      preHandler: [adminAuth],
      schema: {
        tags: ['Admin'],
        summary: 'List all posts with optional status filter',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['ACTIVE', 'DELETED'] },
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            search: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              items: { type: 'array', items: postSchema },
              total: { type: 'integer' },
              page: { type: 'integer' },
              limit: { type: 'integer' },
            },
          },
        },
      },
    },
    async (req) => {
      const { status, page = 1, limit = 20, search } = req.query;
      return svc.listPosts(req.user.tenantId, status, page, limit, search);
    },
  );

  fastify.get<{ Querystring: { status?: UserStatus; page?: number; limit?: number } }>(
    '/users',
    {
      preHandler: [adminAuth],
      schema: {
        tags: ['Admin'],
        summary: 'List all users with optional status filter',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['PENDING_APPROVAL', 'ACTIVE', 'BLOCKED'] },
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        },
      },
    },
    async (req) => {
      const { status, page = 1, limit = 20 } = req.query;
      return svc.listUsers(req.user.tenantId, status, page, limit);
    },
  );

  fastify.patch<{ Params: { id: string }; Body: { status: UserStatus } }>(
    '/users/:id/status',
    {
      preHandler: [adminAuth],
      schema: {
        tags: ['Admin'],
        summary: 'Update user status',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          required: ['status'],
          properties: {
            status: { type: 'string', enum: ['PENDING_APPROVAL', 'ACTIVE', 'BLOCKED'] },
          },
        },
      },
    },
    async (req, reply) => {
      try {
        return await svc.updateUserStatus(req.params.id, req.user.tenantId, req.body.status);
      } catch (err) {
        return handleServiceError(err, reply);
      }
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    '/posts/:id',
    {
      preHandler: [adminAuth],
      schema: {
        tags: ['Admin'],
        summary: 'Hard delete a post (admin moderation)',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        response: { 204: { type: 'null' } },
      },
    },
    async (req, reply) => {
      try {
        await svc.hardDeletePost(req.params.id, req.user.tenantId);
        return reply.code(204).send();
      } catch (err) {
        return handleServiceError(err, reply);
      }
    },
  );

  fastify.get(
    '/metrics',
    {
      preHandler: [adminAuth],
      schema: {
        tags: ['Admin'],
        summary: 'Get community metrics',
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              totalUsers: { type: 'integer' },
              activeUsers: { type: 'integer' },
              totalPosts: { type: 'integer' },
              totalComments: { type: 'integer' },
              totalLikes: { type: 'integer' },
            },
          },
        },
      },
    },
    async (req) => svc.getMetrics(req.user.tenantId),
  );
}
