import type { SupabaseClient } from '@supabase/supabase-js';

type UserStatus = 'PENDING_APPROVAL' | 'ACTIVE' | 'BLOCKED';

const USER_FIELDS =
  'id, email, full_name, avatar_url, headline, role, status, created_at, updated_at, linkedin_id';

const POST_FIELDS = `
  id, tenant_id, body, post_type, image_url, video_url, status, created_at, updated_at,
  author:users!author_id(id, full_name, avatar_url, headline),
  kudos_agg:likes(count),
  poll_options(id, option_text, sort_order, votes_agg:poll_votes(count))
`;

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

function normalisePost(raw: any): any {
  return {
    ...raw,
    kudos_count: Number(raw.kudos_agg?.[0]?.count ?? 0),
    poll_options: normalisePollOptions(raw.poll_options ?? []),
    kudos_agg: undefined,
  };
}

export class AdminService {
  constructor(private readonly supabase: SupabaseClient) {}

  async listUsers(tenantId: string, status: UserStatus | undefined, page: number, limit: number) {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = this.supabase
      .from('users')
      .select(USER_FIELDS, { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (status) query = query.eq('status', status);

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);
    return { items: data ?? [], total: count ?? 0, page, limit };
  }

  async listPosts(tenantId: string, status: 'ACTIVE' | 'DELETED' | undefined, page: number, limit: number, search?: string) {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = this.supabase
      .from('posts')
      .select(POST_FIELDS, { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (status) query = query.eq('status', status);
    if (search) query = query.ilike('body', `%${search}%`);

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);
    return { items: (data ?? []).map(normalisePost), total: count ?? 0, page, limit };
  }

  async updateUserStatus(userId: string, tenantId: string, status: UserStatus) {
    const { data, error } = await this.supabase
      .from('users')
      .update({ status })
      .eq('id', userId)
      .eq('tenant_id', tenantId)
      .select(USER_FIELDS)
      .single();

    if (error || !data) {
      throw Object.assign(new Error(error?.message ?? 'User not found'), { statusCode: 404 });
    }
    return data;
  }

  async hardDeletePost(postId: string, tenantId: string) {
    const { error } = await this.supabase
      .from('posts')
      .delete()
      .eq('id', postId)
      .eq('tenant_id', tenantId);

    if (error) throw new Error(error.message);
  }

  async getMetrics(tenantId: string) {
    const [usersRes, activeRes, postsRes, commentsRes, likesRes] = await Promise.all([
      this.supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId),
      this.supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'ACTIVE'),
      this.supabase
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'ACTIVE'),
      this.supabase
        .from('comments')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('is_deleted', false),
      this.supabase
        .from('likes')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId),
    ]);

    return {
      totalUsers: usersRes.count ?? 0,
      activeUsers: activeRes.count ?? 0,
      totalPosts: postsRes.count ?? 0,
      totalComments: commentsRes.count ?? 0,
      totalLikes: likesRes.count ?? 0,
    };
  }
}
