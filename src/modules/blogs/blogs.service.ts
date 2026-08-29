import type { SupabaseClient } from '@supabase/supabase-js';
import type { FastifyBaseLogger } from 'fastify';

export interface CreateBlogDTO {
  title: string;
  slug?: string;
  summary?: string;
  content: string;
  coverImage?: string;
  cover_image?: string;
  category?: string;
  tags?: string[];
  isPublished?: boolean;
  is_published?: boolean;
  publishedAt?: string;
  published_at?: string;
}

export interface UpdateBlogDTO {
  title?: string;
  slug?: string;
  summary?: string;
  content?: string;
  coverImage?: string;
  cover_image?: string;
  category?: string;
  tags?: string[];
  isPublished?: boolean;
  is_published?: boolean;
  publishedAt?: string;
  published_at?: string;
}

export interface BlogItem {
  id: string;
  tenant_id: string;
  author_id?: string | null;
  title: string;
  slug: string;
  summary?: string | null;
  content: string;
  cover_image?: string | null;
  category: string;
  tags: string[];
  is_published: boolean;
  published_at?: string | null;
  created_at: string;
  updated_at: string;
  author?: {
    id: string;
    full_name: string;
    avatar_url?: string | null;
  } | null;
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export class BlogsService {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly logger?: FastifyBaseLogger,
  ) {}

  /**
   * Helper to resolve default tenant ID if not provided
   */
  private async getDefaultTenantId(): Promise<string> {
    const slug = process.env.DEFAULT_TENANT_SLUG ?? 'tedxpune';
    const { data: tenant } = await this.supabase
      .from('tenants')
      .select('id')
      .eq('slug', slug)
      .eq('is_active', true)
      .single();

    if (!tenant) {
      throw new Error(`Default tenant '${slug}' not found`);
    }

    return tenant.id as string;
  }

  /**
   * List published blogs (Public / Mobile App / Website)
   */
  async listBlogsPublic(
    tenantId?: string,
    page = 1,
    limit = 10,
    category?: string,
  ): Promise<{ items: BlogItem[]; total: number; page: number; limit: number }> {
    const targetTenantId = tenantId || (await this.getDefaultTenantId());
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = this.supabase
      .from('blogs')
      .select('*, author:users(id, full_name, avatar_url)', { count: 'exact' })
      .eq('tenant_id', targetTenantId)
      .eq('is_published', true);

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error, count } = await query
      .order('published_at', { ascending: false })
      .range(from, to);

    if (error) {
      this.logger?.error({ error }, 'Failed to list public blogs');
      throw new Error(`Failed to list blogs: ${error.message}`);
    }

    return {
      items: (data ?? []) as BlogItem[],
      total: count ?? 0,
      page,
      limit,
    };
  }

  /**
   * Get single blog by slug or ID
   */
  async getBlogBySlugOrId(tenantId: string | undefined, slugOrId: string): Promise<BlogItem> {
    const targetTenantId = tenantId || (await this.getDefaultTenantId());
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId);

    let query = this.supabase
      .from('blogs')
      .select('*, author:users(id, full_name, avatar_url)')
      .eq('tenant_id', targetTenantId);

    if (isUuid) {
      query = query.eq('id', slugOrId);
    } else {
      query = query.eq('slug', slugOrId);
    }

    const { data, error } = await query.single();

    if (error || !data) {
      const err = new Error('Blog post not found');
      (err as { statusCode?: number }).statusCode = 404;
      throw err;
    }

    return data as BlogItem;
  }

  /**
   * List all blogs (Admin view including unpublished)
   */
  async listBlogsAdmin(
    tenantId: string,
    page = 1,
    limit = 20,
  ): Promise<{ items: BlogItem[]; total: number; page: number; limit: number }> {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await this.supabase
      .from('blogs')
      .select('*, author:users(id, full_name, avatar_url)', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      this.logger?.error({ error }, 'Failed to list admin blogs');
      throw new Error(`Failed to list blogs: ${error.message}`);
    }

    return {
      items: (data ?? []) as BlogItem[],
      total: count ?? 0,
      page,
      limit,
    };
  }

  /**
   * Create a new blog post
   */
  async createBlog(tenantId: string, authorId: string | null, dto: CreateBlogDTO): Promise<BlogItem> {
    const slugBase = dto.slug || generateSlug(dto.title);
    const coverImage = dto.coverImage ?? dto.cover_image ?? null;
    const isPublished = dto.isPublished ?? dto.is_published ?? true;
    const publishedAt = dto.publishedAt ?? dto.published_at ?? (isPublished ? new Date().toISOString() : null);

    let slug = slugBase;
    let counter = 1;

    // Check slug uniqueness within tenant
    while (true) {
      const { data } = await this.supabase
        .from('blogs')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('slug', slug)
        .maybeSingle();

      if (!data) break;
      slug = `${slugBase}-${counter++}`;
    }

    const { data, error } = await this.supabase
      .from('blogs')
      .insert({
        tenant_id: tenantId,
        author_id: authorId,
        title: dto.title,
        slug,
        summary: dto.summary ?? null,
        content: dto.content,
        cover_image: coverImage,
        category: dto.category ?? 'General',
        tags: dto.tags ?? [],
        is_published: isPublished,
        published_at: publishedAt,
      })
      .select('*, author:users(id, full_name, avatar_url)')
      .single();

    if (error) {
      this.logger?.error({ error }, 'Failed to create blog post');
      throw new Error(`Failed to create blog: ${error.message}`);
    }

    return data as BlogItem;
  }

  /**
   * Update a blog post
   */
  async updateBlog(tenantId: string, id: string, dto: UpdateBlogDTO): Promise<BlogItem> {
    const payload: Record<string, unknown> = {};

    if (dto.title !== undefined) payload.title = dto.title;
    if (dto.summary !== undefined) payload.summary = dto.summary;
    if (dto.content !== undefined) payload.content = dto.content;
    if (dto.category !== undefined) payload.category = dto.category;
    if (dto.tags !== undefined) payload.tags = dto.tags;

    const coverImage = dto.coverImage ?? dto.cover_image;
    if (coverImage !== undefined) payload.cover_image = coverImage;

    const isPublished = dto.isPublished ?? dto.is_published;
    if (isPublished !== undefined) {
      payload.is_published = isPublished;
      if (isPublished && !dto.publishedAt && !dto.published_at) {
        payload.published_at = new Date().toISOString();
      }
    }

    const publishedAt = dto.publishedAt ?? dto.published_at;
    if (publishedAt !== undefined) payload.published_at = publishedAt;

    if (dto.slug !== undefined) {
      payload.slug = generateSlug(dto.slug);
    }

    const { data, error } = await this.supabase
      .from('blogs')
      .update(payload)
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .select('*, author:users(id, full_name, avatar_url)')
      .single();

    if (error || !data) {
      this.logger?.error({ error }, 'Failed to update blog post');
      const err = new Error(error ? `Failed to update blog: ${error.message}` : 'Blog post not found');
      (err as { statusCode?: number }).statusCode = error ? 500 : 404;
      throw err;
    }

    return data as BlogItem;
  }

  /**
   * Delete a blog post
   */
  async deleteBlog(tenantId: string, id: string): Promise<void> {
    const { error } = await this.supabase
      .from('blogs')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('id', id);

    if (error) {
      this.logger?.error({ error }, 'Failed to delete blog post');
      throw new Error(`Failed to delete blog: ${error.message}`);
    }
  }
}
