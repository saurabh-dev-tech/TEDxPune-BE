import type { FastifyInstance } from 'fastify';
import { UsersService } from './users.service';

const userSchema = {
  type: 'object',
  properties: {
    id:         { type: 'string' },
    email:      { type: 'string' },
    full_name:  { type: 'string' },
    avatar_url: { type: 'string', nullable: true },
    headline:   { type: 'string', nullable: true },
    bio:        { type: 'string', nullable: true },
    location:   { type: 'string', nullable: true },
    website:    { type: 'string', nullable: true },
    role:       { type: 'string' },
    status:     { type: 'string' },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
  },
};

export async function usersRoutes(fastify: FastifyInstance) {
  const svc = new UsersService(fastify.supabase);

  fastify.get(
    '/me',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Users'],
        summary: 'Get current user profile',
        security: [{ bearerAuth: [] }],
        response: { 200: userSchema },
      },
    },
    async (req, reply) => {
      const user = await svc.getById(req.user.sub, req.user.tenantId);
      if (!user) return reply.code(404).send({ error: 'User not found' });
      return user;
    },
  );

  fastify.patch<{
    Body: {
      full_name?:  string;
      avatar_url?: string;
      headline?:   string;
      bio?:        string;
      location?:   string;
      website?:    string;
    };
  }>(
    '/me',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Users'],
        summary: 'Update current user profile',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            full_name:  { type: 'string', maxLength: 100 },
            avatar_url: { type: 'string', maxLength: 500 },
            headline:   { type: 'string', maxLength: 160 },
            bio:        { type: 'string', maxLength: 500  },
            location:   { type: 'string', maxLength: 100  },
            website:    { type: 'string', maxLength: 255  },
          },
          additionalProperties: false,
        },
        response: { 200: userSchema },
      },
    },
    async (req, reply) => {
      const { full_name, avatar_url, headline, bio, location, website } = req.body;
      try {
        return await svc.updateProfile(req.user.sub, req.user.tenantId, {
          full_name, avatar_url, headline, bio, location, website,
        });
      } catch (err: unknown) {
        const msg = (err as Error).message;
        const code = msg === 'Nothing to update' ? 400 : 500;
        return reply.code(code).send({ error: msg });
      }
    },
  );

  fastify.get<{ Querystring: { page?: number; limit?: number } }>(
    '/',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Users'],
        summary: 'List active members (directory)',
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              items: { type: 'array', items: userSchema },
              total: { type: 'integer' },
              page: { type: 'integer' },
              limit: { type: 'integer' },
            },
          },
        },
      },
    },
    async (req) => {
      const page = req.query.page ?? 1;
      const limit = req.query.limit ?? 20;
      return svc.listActive(req.user.tenantId, page, limit);
    },
  );

  fastify.get<{ Params: { id: string } }>(
    '/:id',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Users'],
        summary: 'Get user by ID',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        response: { 200: userSchema },
      },
    },
    async (req, reply) => {
      const user = await svc.getById(req.params.id, req.user.tenantId);
      if (!user) return reply.code(404).send({ error: 'User not found' });
      return user;
    },
  );
}
