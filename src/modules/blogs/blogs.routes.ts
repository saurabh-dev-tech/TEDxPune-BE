import type { FastifyInstance, FastifyReply } from 'fastify';
import { BlogsService, CreateBlogDTO, UpdateBlogDTO } from './blogs.service';

function fail(reply: FastifyReply, err: unknown, fallbackCode = 500) {
  const message = err instanceof Error ? err.message : 'Internal error';
  const code = (err as { statusCode?: number }).statusCode ?? fallbackCode;
  return reply.code(code).send({ error: message });
}

// ─── JSON Schemas for Swagger ────────────────────────────────────────────────

const authorSchema = {
  type: 'object' as const,
  nullable: true,
  properties: {
    id:         { type: 'string' as const },
    full_name:  { type: 'string' as const },
    avatar_url: { type: 'string' as const, nullable: true },
  },
};

const blogSchema = {
  type: 'object' as const,
  properties: {
    id:           { type: 'string' as const },
    tenant_id:    { type: 'string' as const },
    author_id:    { type: 'string' as const, nullable: true },
    title:        { type: 'string' as const },
    slug:         { type: 'string' as const },
    summary:      { type: 'string' as const, nullable: true },
    content:      { type: 'string' as const },
    cover_image:  { type: 'string' as const, nullable: true },
    category:     { type: 'string' as const },
    tags:         { type: 'array' as const, items: { type: 'string' as const } },
    is_published: { type: 'boolean' as const },
    published_at: { type: 'string' as const, nullable: true },
    created_at:   { type: 'string' as const },
    updated_at:   { type: 'string' as const },
    author:       authorSchema,
  },
};

const uploadResponseSchema = {
  type: 'object' as const,
  properties: {
    url:       { type: 'string' as const },
    public_id: { type: 'string' as const },
  },
};

export async function blogsRoutes(fastify: FastifyInstance) {
  const svc = new BlogsService(fastify.supabase, fastify.log);
  const prefix = fastify.prefix ?? '';
  const isAdminPrefix = prefix.endsWith('/admin/blogs');
  const baseAdminPath = isAdminPrefix ? '' : '/admin';

  // ─── Public Endpoints ───────────────────────────────────────────────────────
  if (!isAdminPrefix) {
    // GET /blogs - list published blogs (Public, unauthenticated)
    fastify.get<{ Querystring: { page?: string; limit?: string; category?: string } }>(
      '/',
      {
        schema: {
          tags: ['Blogs'],
          summary: 'List published blog posts (Public)',
          querystring: {
            type: 'object',
            properties: {
              page:     { type: 'string', default: '1' },
              limit:    { type: 'string', default: '10' },
              category: { type: 'string' },
            },
          },
          response: {
            200: {
              type: 'object',
              properties: {
                items: { type: 'array', items: blogSchema },
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
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit ?? '10', 10) || 10));
        const tenantId = req.user?.tenantId;
        return svc.listBlogsPublic(tenantId, page, limit, req.query.category);
      },
    );

    // GET /blogs/:slugOrId - get blog post details (Public, unauthenticated)
    fastify.get<{ Params: { slugOrId: string } }>(
      '/:slugOrId',
      {
        schema: {
          tags: ['Blogs'],
          summary: 'Get single blog post details by slug or ID (Public)',
          params: {
            type: 'object',
            properties: { slugOrId: { type: 'string' } },
            required: ['slugOrId'],
          },
          response: { 200: blogSchema },
        },
      },
      async (req, reply) => {
        try {
          const tenantId = req.user?.tenantId;
          return await svc.getBlogBySlugOrId(tenantId, req.params.slugOrId);
        } catch (err) {
          return fail(reply, err);
        }
      },
    );
  }

  // ─── Admin Endpoints ────────────────────────────────────────────────────────
  const adminGuard = fastify.authorizeRoles(['ADMIN', 'SUPER_ADMIN']);

  // POST /blogs/upload-image (or /admin/blogs/upload-image) - Upload image to Cloudinary
  fastify.post(
    `${baseAdminPath}/upload-image`,
    {
      preHandler: [adminGuard],
      schema: {
        tags: ['Blogs - Admin'],
        summary: 'Upload a blog cover or content image to Cloudinary',
        security: [{ bearerAuth: [] }],
        response: { 200: uploadResponseSchema },
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
      const publicId = `blog_${req.user.tenantId}_${Date.now()}`;
      const folder = process.env.CLOUDINARY_BLOGS_FOLDER || 'tedxpune/blogs';

      try {
        const uploadResult = await fastify.cloudinary.uploadImage(fileBuffer, {
          folder,
          publicId,
        });

        return {
          url: uploadResult.secure_url,
          public_id: uploadResult.public_id,
        };
      } catch (err: unknown) {
        fastify.log.error({ err }, 'Cloudinary image upload error');
        const msg = err instanceof Error ? err.message : JSON.stringify(err);
        return reply.code(500).send({ error: `Image upload failed: ${msg}` });
      }
    },
  );

  // GET /blogs/admin (or /admin/blogs) - list all blogs including draft
  fastify.get<{ Querystring: { page?: string; limit?: string } }>(
    baseAdminPath || '/',
    {
      preHandler: [adminGuard],
      schema: {
        tags: ['Blogs - Admin'],
        summary: 'List all blog posts including unpublished (admin)',
        security: [{ bearerAuth: [] }],
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
              items: { type: 'array', items: blogSchema },
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
      return svc.listBlogsAdmin(req.user.tenantId, page, limit);
    },
  );

  // POST /blogs (or /admin/blogs) - create a blog post
  fastify.post<{ Body: CreateBlogDTO }>(
    baseAdminPath || '/',
    {
      preHandler: [adminGuard],
      schema: {
        tags: ['Blogs - Admin'],
        summary: 'Create a new blog post',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['title', 'content'],
          properties: {
            title:        { type: 'string', minLength: 1 },
            slug:         { type: 'string' },
            summary:      { type: 'string' },
            content:      { type: 'string', minLength: 1 },
            coverImage:   { type: 'string' },
            cover_image:  { type: 'string' },
            category:     { type: 'string' },
            tags:         { type: 'array', items: { type: 'string' } },
            isPublished:  { type: 'boolean' },
            is_published: { type: 'boolean' },
            publishedAt:  { type: 'string' },
            published_at: { type: 'string' },
          },
        },
        response: { 201: blogSchema },
      },
    },
    async (req, reply) => {
      try {
        const blog = await svc.createBlog(req.user.tenantId, req.user.userId ?? null, req.body);
        return reply.code(201).send(blog);
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  // PATCH /blogs/:id (or /admin/blogs/:id) - update a blog post
  fastify.patch<{ Params: { id: string }; Body: UpdateBlogDTO }>(
    `${baseAdminPath}/:id`,
    {
      preHandler: [adminGuard],
      schema: {
        tags: ['Blogs - Admin'],
        summary: 'Update an existing blog post',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { id: { type: 'string' } },
          required: ['id'],
        },
        body: {
          type: 'object',
          properties: {
            title:        { type: 'string' },
            slug:         { type: 'string' },
            summary:      { type: 'string' },
            content:      { type: 'string' },
            coverImage:   { type: 'string' },
            cover_image:  { type: 'string' },
            category:     { type: 'string' },
            tags:         { type: 'array', items: { type: 'string' } },
            isPublished:  { type: 'boolean' },
            is_published: { type: 'boolean' },
            publishedAt:  { type: 'string' },
            published_at: { type: 'string' },
          },
        },
        response: { 200: blogSchema },
      },
    },
    async (req, reply) => {
      try {
        return await svc.updateBlog(req.user.tenantId, req.params.id, req.body);
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  // DELETE /blogs/:id (or /admin/blogs/:id) - delete a blog post
  fastify.delete<{ Params: { id: string } }>(
    `${baseAdminPath}/:id`,
    {
      preHandler: [adminGuard],
      schema: {
        tags: ['Blogs - Admin'],
        summary: 'Delete a blog post',
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
        await svc.deleteBlog(req.user.tenantId, req.params.id);
        return reply.code(204).send();
      } catch (err) {
        return fail(reply, err);
      }
    },
  );
}
