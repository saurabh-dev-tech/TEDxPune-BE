import type { SupabaseClient } from '@supabase/supabase-js';

const POST_FIELDS = `
  id, body, post_type, image_url, video_url, status, created_at, updated_at,
  author:users!author_id(id, full_name, avatar_url, headline),
  kudos_agg:likes(count),
  poll_options(id, option_text, sort_order, votes_agg:poll_votes(count))
`;

const COMMENT_FIELDS = `
  id, post_id, body, depth, is_deleted, created_at, parent_id,
  author:users!author_id(id, full_name, avatar_url)
`;

export interface CreatePostPayload {
  body: string;
  post_type?: 'text' | 'image' | 'video' | 'poll';
  image_url?: string;
  video_url?: string;
  poll_options?: string[];   // option texts, required when post_type = 'poll'
}

function normalisePollOptions(raw: any[]): any[] {
  return (raw ?? [])
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(opt => ({
      id: opt.id,
      option_text: opt.option_text,
      sort_order: opt.sort_order,
      vote_count: Number(opt.votes_agg?.[0]?.count ?? 0),
    }));
}

function normalisePost(raw: any, userKudoedSet: Set<string>, userVoteMap: Map<string, string>): any {
  return {
    ...raw,
    kudos_count: Number(raw.kudos_agg?.[0]?.count ?? 0),
    user_kudoed: userKudoedSet.has(raw.id),
    user_vote_option_id: userVoteMap.get(raw.id) ?? null,
    poll_options: normalisePollOptions(raw.poll_options ?? []),
    kudos_agg: undefined,
  };
}

export class PostsService {
  constructor(private readonly supabase: SupabaseClient) {}

  async assertUserActive(userId: string, tenantId: string): Promise<void> {
    const { data } = await this.supabase
      .from('users')
      .select('status')
      .eq('id', userId)
      .eq('tenant_id', tenantId)
      .single();

    if (!data || data.status !== 'ACTIVE') {
      throw Object.assign(new Error('User is not active'), { statusCode: 403 });
    }
  }

  async listFeed(tenantId: string, userId: string, page: number, limit: number) {
    const from = (page - 1) * limit;
    const to   = from + limit - 1;

    const { data, error, count } = await this.supabase
      .from('posts')
      .select(POST_FIELDS, { count: 'exact' })
      .eq('tenant_id', tenantId)
      .eq('status', 'ACTIVE')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw new Error(error.message);

    const postIds = (data ?? []).map((p: any) => p.id);
    const userKudoedSet = new Set<string>();
    const userVoteMap   = new Map<string, string>();

    if (postIds.length > 0) {
      const [{ data: kudos }, { data: votes }] = await Promise.all([
        this.supabase
          .from('likes')
          .select('post_id')
          .eq('user_id', userId)
          .eq('tenant_id', tenantId)
          .in('post_id', postIds),
        this.supabase
          .from('poll_votes')
          .select('post_id, option_id')
          .eq('user_id', userId)
          .eq('tenant_id', tenantId)
          .in('post_id', postIds),
      ]);

      (kudos ?? []).forEach((k: any) => userKudoedSet.add(k.post_id));
      (votes ?? []).forEach((v: any) => userVoteMap.set(v.post_id, v.option_id));
    }

    return {
      items: (data ?? []).map((p: any) => normalisePost(p, userKudoedSet, userVoteMap)),
      total: count ?? 0,
      page,
      limit,
    };
  }

  async createPost(tenantId: string, authorId: string, payload: CreatePostPayload) {
    await this.assertUserActive(authorId, tenantId);

    if (payload.post_type === 'poll' && (!payload.poll_options || payload.poll_options.length < 2)) {
      throw Object.assign(new Error('A poll requires at least 2 options'), { statusCode: 422 });
    }

    const { data: post, error } = await this.supabase
      .from('posts')
      .insert({
        tenant_id: tenantId,
        author_id: authorId,
        body:      payload.body,
        post_type: payload.post_type ?? 'text',
        image_url: payload.image_url ?? null,
        video_url: payload.video_url ?? null,
      })
      .select('id, body, post_type, image_url, video_url, status, created_at, updated_at, author:users!author_id(id, full_name, avatar_url, headline)')
      .single();

    if (error || !post) throw new Error(error?.message ?? 'Create failed');

    if (payload.post_type === 'poll' && payload.poll_options?.length) {
      const { error: pollErr } = await this.supabase
        .from('poll_options')
        .insert(
          payload.poll_options.map((text, i) => ({
            post_id:     post.id,
            tenant_id:   tenantId,
            option_text: text.trim(),
            sort_order:  i,
          }))
        );

      if (pollErr) {
        // Rollback: soft-delete the orphaned post
        await this.supabase.from('posts').update({ status: 'DELETED' }).eq('id', post.id);
        throw new Error(pollErr.message ?? 'Failed to save poll options');
      }
    }

    return { ...post, kudos_count: 0, user_kudoed: false, poll_options: [], user_vote_option_id: null };
  }

  async softDeletePost(postId: string, tenantId: string, requesterId: string, requesterRole: string) {
    const { data: post } = await this.supabase
      .from('posts')
      .select('author_id, status')
      .eq('id', postId)
      .eq('tenant_id', tenantId)
      .single();

    if (!post) throw Object.assign(new Error('Post not found'), { statusCode: 404 });
    if (post.status === 'DELETED') throw Object.assign(new Error('Already deleted'), { statusCode: 410 });

    const isAdmin = requesterRole === 'ADMIN' || requesterRole === 'SUPER_ADMIN';
    if (post.author_id !== requesterId && !isAdmin) {
      throw Object.assign(new Error('Forbidden'), { statusCode: 403 });
    }

    const { error } = await this.supabase
      .from('posts')
      .update({ status: 'DELETED' })
      .eq('id', postId)
      .eq('tenant_id', tenantId);

    if (error) throw new Error(error.message);
  }

  /** Toggle kudos (reuses the likes table). Returns new state. */
  async toggleKudos(postId: string, tenantId: string, userId: string): Promise<{ kudoed: boolean; kudos_count: number }> {
    // No active-status gate — any authenticated user can give kudos

    const { data: existing } = await this.supabase
      .from('likes')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (existing) {
      await this.supabase.from('likes').delete().eq('id', existing.id);
    } else {
      await this.supabase.from('likes').insert({ post_id: postId, user_id: userId, tenant_id: tenantId });
    }

    const { count } = await this.supabase
      .from('likes')
      .select('id', { count: 'exact', head: true })
      .eq('post_id', postId)
      .eq('tenant_id', tenantId);

    return { kudoed: !existing, kudos_count: count ?? 0 };
  }

  async votePoll(postId: string, optionId: string, tenantId: string, userId: string) {
    // No active-status gate — any authenticated user can vote on a poll

    const { data: option } = await this.supabase
      .from('poll_options')
      .select('id')
      .eq('id', optionId)
      .eq('post_id', postId)
      .maybeSingle();

    if (!option) throw Object.assign(new Error('Invalid poll option'), { statusCode: 400 });

    const { error } = await this.supabase
      .from('poll_votes')
      .insert({ option_id: optionId, post_id: postId, user_id: userId, tenant_id: tenantId });

    if (error) {
      if (error.code === '23505') throw Object.assign(new Error('Already voted'), { statusCode: 409 });
      throw new Error(error.message);
    }
  }

  async listComments(postId: string, tenantId: string) {
    const { data, error } = await this.supabase
      .from('comments')
      .select(COMMENT_FIELDS)
      .eq('post_id', postId)
      .eq('tenant_id', tenantId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async createComment(postId: string, tenantId: string, authorId: string, body: string, parentId?: string) {
    await this.assertUserActive(authorId, tenantId);

    let depth = 0;
    if (parentId) {
      const { data: parent } = await this.supabase
        .from('comments')
        .select('depth')
        .eq('id', parentId)
        .eq('post_id', postId)
        .single();

      if (!parent) throw Object.assign(new Error('Parent comment not found'), { statusCode: 404 });
      if (parent.depth >= 1) throw Object.assign(new Error('Max comment depth exceeded'), { statusCode: 422 });
      depth = parent.depth + 1;
    }

    const { data, error } = await this.supabase
      .from('comments')
      .insert({ post_id: postId, tenant_id: tenantId, author_id: authorId, body, parent_id: parentId ?? null, depth })
      .select(COMMENT_FIELDS)
      .single();

    if (error || !data) throw new Error(error?.message ?? 'Create failed');
    return data;
  }

  async updatePost(postId: string, tenantId: string, authorId: string, role: string, payload: { body?: string; image_url?: string; video_url?: string; poll_options?: string[] }) {
    const { data: post } = await this.supabase
      .from('posts')
      .select('author_id, post_type')
      .eq('id', postId)
      .eq('tenant_id', tenantId)
      .single();

    if (!post) throw Object.assign(new Error('Post not found'), { statusCode: 404 });

    const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN';
    if (post.author_id !== authorId && !isAdmin) {
      throw Object.assign(new Error('Forbidden'), { statusCode: 403 });
    }

    const updateData: any = { updated_at: new Date().toISOString() };
    if (payload.body !== undefined) updateData.body = payload.body;
    if (payload.image_url !== undefined && post.post_type === 'image') updateData.image_url = payload.image_url;
    if (payload.video_url !== undefined && post.post_type === 'video') updateData.video_url = payload.video_url;

    if (Object.keys(updateData).length > 1) {
      const { error } = await this.supabase
        .from('posts')
        .update(updateData)
        .eq('id', postId)
        .eq('tenant_id', tenantId);

      if (error) throw new Error(error.message);
    }

    if (post.post_type === 'poll' && payload.poll_options) {
      const { data: existingOpts } = await this.supabase
        .from('poll_options')
        .select('id, sort_order')
        .eq('post_id', postId)
        .order('sort_order', { ascending: true });

      if (existingOpts) {
        for (let i = 0; i < payload.poll_options.length; i++) {
          const optText = payload.poll_options[i];
          const existingOpt = existingOpts[i];
          if (existingOpt) {
            await this.supabase
              .from('poll_options')
              .update({ option_text: optText.trim() })
              .eq('id', existingOpt.id);
          } else {
            await this.supabase
              .from('poll_options')
              .insert({
                post_id: postId,
                tenant_id: tenantId,
                option_text: optText.trim(),
                sort_order: i,
              });
          }
        }
        if (existingOpts.length > payload.poll_options.length) {
          const extraOptIds = existingOpts.slice(payload.poll_options.length).map(o => o.id);
          await this.supabase
            .from('poll_options')
            .delete()
            .in('id', extraOptIds);
        }
      }
    }

    const { data: updatedPost } = await this.supabase
      .from('posts')
      .select(POST_FIELDS)
      .eq('id', postId)
      .eq('tenant_id', tenantId)
      .single();

    return normalisePost(updatedPost, new Set(), new Map());
  }
}
