import type { FastifyInstance, FastifyReply } from 'fastify';
import { PostsService } from './posts.service';

const authorSchema = {
  type: 'object',
  properties: {
    id:         { type: 'string' },
    full_name:  { type: 'string' },
    avatar_url: { type: 'string', nullable: true },
    headline:   { type: 'string', nullable: true },
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
    id:                   { type: 'string' },
    body:                 { type: 'string' },
    post_type:            { type: 'string' },
    image_url:            { type: 'string', nullable: true },
    video_url:            { type: 'string', nullable: true },
    status:               { type: 'string' },
    created_at:           { type: 'string' },
    updated_at:           { type: 'string' },
    kudos_count:          { type: 'integer' },
    user_kudoed:          { type: 'boolean' },
    user_vote_option_id:  { type: 'string', nullable: true },
    author:               authorSchema,
    poll_options:         { type: 'array', items: pollOptionSchema },
  },
};

const commentSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' }, post_id: { type: 'string' }, body: { type: 'string' },
    depth: { type: 'integer' }, parent_id: { type: 'string', nullable: true },
    created_at: { type: 'string' }, author: authorSchema,
  },
};

function handleServiceError(err: unknown, reply: FastifyReply) {
  const e = err as { statusCode?: number; message: string };
  return reply.code(e.statusCode ?? 500).send({ error: e.message });
}

export async function postsRoutes(fastify: FastifyInstance) {
  const svc = new PostsService(fastify.supabase);

  /* ── GET / — paginated feed ── */
  fastify.get<{ Querystring: { page?: number; limit?: number } }>(
    '/',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Posts'], summary: 'Get paginated feed', security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            page:  { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              items: { type: 'array', items: postSchema },
              total: { type: 'integer' },
              page:  { type: 'integer' },
              limit: { type: 'integer' },
            },
          },
        },
      },
    },
    async (req) => {
      const page  = req.query.page  ?? 1;
      const limit = req.query.limit ?? 20;
      return svc.listFeed(req.user.tenantId, req.user.sub, page, limit);
    },
  );

  /* ── POST / — create post (text | image | video | poll) ── */
  fastify.post<{
    Body: {
      body: string;
      post_type?: 'text' | 'image' | 'video' | 'poll';
      image_url?: string;
      video_url?: string;
      poll_options?: string[];
    };
  }>(
    '/',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Posts'], summary: 'Create a post', security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['body'],
          properties: {
            body:         { type: 'string', minLength: 1, maxLength: 3000 },
            post_type:    { type: 'string', enum: ['text', 'image', 'video', 'poll'], default: 'text' },
            image_url:    { type: 'string', maxLength: 500 },
            video_url:    { type: 'string', maxLength: 500 },
            poll_options: { type: 'array', items: { type: 'string', maxLength: 100 }, minItems: 2, maxItems: 4 },
          },
        },
        response: { 201: postSchema },
      },
    },
    async (req, reply) => {
      try {
        const post = await svc.createPost(req.user.tenantId, req.user.sub, req.body);
        return reply.code(201).send(post);
      } catch (err) {
        return handleServiceError(err, reply);
      }
    },
  );

  /* ── PATCH /:id ── */
  fastify.patch<{ Params: { id: string }; Body: { body?: string; image_url?: string; video_url?: string; poll_options?: string[] } }>(
    '/:id',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Posts'], summary: 'Update a post', security: [{ bearerAuth: [] }],
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
        body: {
          type: 'object',
          properties: {
            body:         { type: 'string', minLength: 1, maxLength: 3000 },
            image_url:    { type: 'string', maxLength: 500 },
            video_url:    { type: 'string', maxLength: 500 },
            poll_options: { type: 'array', items: { type: 'string', maxLength: 100 }, minItems: 2, maxItems: 4 },
          },
        },
        response: { 200: postSchema },
      },
    },
    async (req, reply) => {
      try {
        const post = await svc.updatePost(req.params.id, req.user.tenantId, req.user.sub, req.user.role, req.body);
        return reply.code(200).send(post);
      } catch (err) {
        return handleServiceError(err, reply);
      }
    },
  );

  /* ── DELETE /:id ── */
  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Posts'], summary: 'Delete a post (soft)', security: [{ bearerAuth: [] }],
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
        response: { 204: { type: 'null' } },
      },
    },
    async (req, reply) => {
      try {
        await svc.softDeletePost(req.params.id, req.user.tenantId, req.user.sub, req.user.role);
        return reply.code(204).send();
      } catch (err) {
        return handleServiceError(err, reply);
      }
    },
  );

  /* ── POST /:id/kudos — toggle kudos ── */
  fastify.post<{ Params: { id: string } }>(
    '/:id/kudos',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Posts'], summary: 'Toggle kudos on a post', security: [{ bearerAuth: [] }],
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
        response: {
          200: {
            type: 'object',
            properties: {
              kudoed:      { type: 'boolean' },
              kudos_count: { type: 'integer' },
            },
          },
        },
      },
    },
    async (req, reply) => {
      try {
        const result = await svc.toggleKudos(req.params.id, req.user.tenantId, req.user.sub);
        return reply.code(200).send(result);
      } catch (err) {
        return handleServiceError(err, reply);
      }
    },
  );

  /* ── POST /:id/poll/vote — cast a poll vote ── */
  fastify.post<{ Params: { id: string }; Body: { option_id: string } }>(
    '/:id/poll/vote',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Posts'], summary: 'Vote on a poll', security: [{ bearerAuth: [] }],
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
        body: {
          type: 'object',
          required: ['option_id'],
          properties: { option_id: { type: 'string', format: 'uuid' } },
        },
        response: { 204: { type: 'null' } },
      },
    },
    async (req, reply) => {
      try {
        await svc.votePoll(req.params.id, req.body.option_id, req.user.tenantId, req.user.sub);
        return reply.code(204).send();
      } catch (err) {
        return handleServiceError(err, reply);
      }
    },
  );

  /* ── GET /:id/comments ── */
  fastify.get<{ Params: { id: string } }>(
    '/:id/comments',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Posts'], summary: 'List comments on a post', security: [{ bearerAuth: [] }],
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
        response: { 200: { type: 'array', items: commentSchema } },
      },
    },
    async (req, reply) => {
      try {
        return await svc.listComments(req.params.id, req.user.tenantId);
      } catch (err) {
        return handleServiceError(err, reply);
      }
    },
  );

  /* ── POST /:id/comments ── */
  fastify.post<{ Params: { id: string }; Body: { body: string; parentId?: string } }>(
    '/:id/comments',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Posts'], summary: 'Add a comment or reply', security: [{ bearerAuth: [] }],
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
        body: {
          type: 'object', required: ['body'],
          properties: {
            body:     { type: 'string', minLength: 1, maxLength: 1000 },
            parentId: { type: 'string', format: 'uuid' },
          },
        },
        response: { 201: commentSchema },
      },
    },
    async (req, reply) => {
      try {
        const comment = await svc.createComment(
          req.params.id, req.user.tenantId, req.user.sub, req.body.body, req.body.parentId,
        );
        return reply.code(201).send(comment);
      } catch (err) {
        return handleServiceError(err, reply);
      }
    },
  );
}
