import type { SupabaseClient } from '@supabase/supabase-js';

const USER_FIELDS =
  'id, tenant_id, email, full_name, avatar_url, headline, bio, location, website, role, status, created_at, updated_at';

export interface UpdateProfilePayload {
  full_name?: string;
  avatar_url?: string;
  headline?:   string;
  bio?:        string;
  location?:   string;
  website?:    string;
}

export class UsersService {
  constructor(private readonly supabase: SupabaseClient) {}

  async getById(userId: string, tenantId: string) {
    const { data, error } = await this.supabase
      .from('users')
      .select(USER_FIELDS)
      .eq('id', userId)
      .eq('tenant_id', tenantId)
      .single();

    if (error || !data) return null;
    return data;
  }

  async updateProfile(userId: string, tenantId: string, payload: UpdateProfilePayload) {
    // Strip undefined keys so we don't accidentally null-out existing data
    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
      if (value !== undefined) updates[key] = value;
    }

    if (Object.keys(updates).length === 0) {
      throw new Error('Nothing to update');
    }

    const { data, error } = await this.supabase
      .from('users')
      .update(updates)
      .eq('id', userId)
      .eq('tenant_id', tenantId)
      .select(USER_FIELDS)
      .single();

    if (error || !data) throw new Error(error?.message ?? 'Update failed');
    return data;
  }

  async listActive(tenantId: string, page: number, limit: number) {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await this.supabase
      .from('users')
      .select(USER_FIELDS, { count: 'exact' })
      .eq('tenant_id', tenantId)
      .eq('status', 'ACTIVE')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw new Error(error.message);
    return { items: data ?? [], total: count ?? 0, page, limit };
  }
}
