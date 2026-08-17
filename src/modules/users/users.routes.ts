import type { FastifyInstance, FastifyReply } from 'fastify';
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
    linkedin:   { type: 'string', nullable: true },
    whatsapp:   { type: 'string', nullable: true },
    instagram:  { type: 'string', nullable: true },
    x:          { type: 'string', nullable: true },
    consent:    { type: 'boolean' },
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

  const consentHandler = async (
    req: { user: { sub: string; tenantId: string }; body?: { consent?: boolean } },
    reply: FastifyReply,
  ) => {
    try {
      const consentVal = req.body?.consent ?? true;
      return await svc.updateConsent(req.user.sub, req.user.tenantId, consentVal);
    } catch (err: unknown) {
      const msg = (err as Error).message;
      return reply.code(500).send({ error: msg });
    }
  };

  const consentSchema = {
    tags: ['Users'],
    summary: 'Update user consent status (turns consent flag to true on first login)',
    security: [{ bearerAuth: [] }],
    body: {
      type: 'object',
      properties: {
        consent: { type: 'boolean', default: true },
      },
      additionalProperties: false,
    },
    response: { 200: userSchema },
  };

  fastify.post<{ Body: { consent?: boolean } }>(
    '/me/consent',
    {
      preHandler: [fastify.authenticate],
      schema: consentSchema,
    },
    consentHandler,
  );

  fastify.post<{ Body: { consent?: boolean } }>(
    '/consent',
    {
      preHandler: [fastify.authenticate],
      schema: { ...consentSchema, summary: 'Update user consent status (alias)' },
    },
    consentHandler,
  );

  fastify.post(
    '/me/avatar',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Users'],
        summary: 'Upload user profile photo to Cloudinary',
        security: [{ bearerAuth: [] }],
        response: { 200: userSchema },
      },
    },
    async (req, reply) => {
      const data = await req.file();
      if (!data) {
        return reply.code(400).send({ error: 'No image file provided' });
      }

      if (!data.mimetype.startsWith('image/')) {
        return reply.code(400).send({ error: 'Uploaded file must be an image' });
      }

      const fileBuffer = await data.toBuffer();
      const publicId = `avatar_${req.user.sub}_${Date.now()}`;

      try {
        const uploadResult = await fastify.cloudinary.uploadImage(fileBuffer, {
          publicId,
        });

        const updatedUser = await svc.updateProfile(req.user.sub, req.user.tenantId, {
          avatar_url: uploadResult.secure_url,
        });

        return updatedUser;
      } catch (err: unknown) {
        const msg = (err as Error).message;
        return reply.code(500).send({ error: `Avatar upload failed: ${msg}` });
      }
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
      linkedin?:   string;
      whatsapp?:   string;
      instagram?:  string;
      x?:          string;
      consent?:    boolean;
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
            linkedin:   { type: 'string', maxLength: 255  },
            whatsapp:   { type: 'string', maxLength: 100  },
            instagram:  { type: 'string', maxLength: 255  },
            x:          { type: 'string', maxLength: 255  },
            consent:    { type: 'boolean' },
          },
          additionalProperties: false,
        },
        response: { 200: userSchema },
      },
    },
    async (req, reply) => {
      const { full_name, avatar_url, headline, bio, location, website, linkedin, whatsapp, instagram, x, consent } = req.body;
      try {
        return await svc.updateProfile(req.user.sub, req.user.tenantId, {
          full_name, avatar_url, headline, bio, location, website, linkedin, whatsapp, instagram, x, consent,
        });
      } catch (err: unknown) {
        const msg = (err as Error).message;
        const code = msg === 'Nothing to update' ? 400 : 500;
        return reply.code(code).send({ error: msg });
      }
    },
  );

  fastify.get<{ Querystring: { page?: number; limit?: number } }>(
    '/directory',
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

  fastify.post<{ Body: { pushToken: string; platform?: string } }>(
    '/push-token',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Users'],
        summary: 'Register Expo push notification token',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['pushToken'],
          properties: {
            pushToken: { type: 'string' },
            platform: { type: 'string' },
          },
        },
      },
    },
    async (req, reply) => {
      try {
        const { pushToken, platform } = req.body;
        return await svc.savePushToken(req.user.sub, pushToken, platform);
      } catch (err: unknown) {
        return reply.code(500).send({ error: (err as Error).message });
      }
    },
  );

  fastify.patch<{
    Params: { id: string };
    Body: {
      full_name?:  string;
      avatar_url?: string;
      headline?:   string;
      bio?:        string;
      location?:   string;
      website?:    string;
      linkedin?:   string;
      whatsapp?:   string;
      instagram?:  string;
      x?:          string;
      consent?:    boolean;
    };
  }>(
    '/:id',
    {
      preHandler: [fastify.authenticate],
      schema: {
        tags: ['Users'],
        summary: 'Update user profile by ID',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          properties: {
            full_name:  { type: 'string', maxLength: 100 },
            avatar_url: { type: 'string', maxLength: 500 },
            headline:   { type: 'string', maxLength: 160 },
            bio:        { type: 'string', maxLength: 500  },
            location:   { type: 'string', maxLength: 100  },
            website:    { type: 'string', maxLength: 255  },
            linkedin:   { type: 'string', maxLength: 255  },
            whatsapp:   { type: 'string', maxLength: 100  },
            instagram:  { type: 'string', maxLength: 255  },
            x:          { type: 'string', maxLength: 255  },
            consent:    { type: 'boolean' },
          },
          additionalProperties: false,
        },
        response: { 200: userSchema },
      },
    },
    async (req, reply) => {
      const { full_name, avatar_url, headline, bio, location, website, linkedin, whatsapp, instagram, x, consent } = req.body;
      try {
        return await svc.updateProfile(req.params.id, req.user.tenantId, {
          full_name, avatar_url, headline, bio, location, website, linkedin, whatsapp, instagram, x, consent,
        });
      } catch (err: unknown) {
        const msg = (err as Error).message;
        const code = msg === 'Nothing to update' ? 400 : 500;
        return reply.code(code).send({ error: msg });
      }
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
