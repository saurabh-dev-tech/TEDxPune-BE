import type { SupabaseClient, User as SupabaseUser } from '@supabase/supabase-js';
import type { FastifyInstance } from 'fastify';
import { createHash } from 'crypto';

/**
 * Generate a Gravatar URL from an email address.
 * Falls back to a UI Avatars URL if Gravatar has no image (d=404 would show nothing).
 * Using `d=blank` so the app's initial-letter fallback takes over when there's no Gravatar.
 */
function gravatarUrl(email: string, size = 200): string {
  const hash = createHash('md5').update(email.trim().toLowerCase()).digest('hex');
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=mp`;
}

// ─── Shared profile type for all OAuth providers ───────────────────────────────
export type AuthProvider = 'linkedin' | 'google' | 'apple';

export interface OAuthProfile {
  provider: AuthProvider;
  providerId: string;
  email: string;
  fullName: string;
  avatarUrl?: string | null;
}

const PROVIDER_COL: Record<AuthProvider, string> = {
  linkedin: 'linkedin_id',
  google: 'google_id',
  apple: 'apple_id',
};

const USER_FIELDS = 'id, email, full_name, avatar_url, role, status';

export class AuthService {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly fastify: FastifyInstance,
  ) {}

  private async resolveTenantId(): Promise<string> {
    const slug = process.env.DEFAULT_TENANT_SLUG ?? 'tedxpune';
    const { data, error } = await this.supabase
      .from('tenants')
      .select('id')
      .eq('slug', slug)
      .eq('is_active', true)
      .single();

    if (error || !data) {
      // Surface the real Supabase error so you can see exactly what's wrong
      const detail = error
        ? `Supabase error [${error.code}]: ${error.message} (hint: ${error.hint ?? 'none'})`
        : 'Query returned no rows — tenant row missing or is_active=false';

      this.fastify.log.error(
        { slug, supabaseError: error },
        `[auth] resolveTenantId failed — ${detail}`,
      );

      throw new Error(`Tenant '${slug}' not found. ${detail}`);
    }

    return data.id as string;
  }

  /**
   * Resolve the best avatar URL for a user.
   * Priority: existing DB value → Supabase metadata (Google/Apple) → Gravatar.
   */
  private resolveAvatarUrl(
    dbAvatar: string | null | undefined,
    supabaseUser: SupabaseUser | null,
    email: string,
  ): string {
    // 1. Already has a valid URL in the DB
    if (dbAvatar && dbAvatar.startsWith('http')) return dbAvatar;

    // 2. Pull from Supabase user metadata (Google/Apple sign-in sets this)
    if (supabaseUser) {
      const metaAvatar =
        (supabaseUser.user_metadata?.avatar_url as string) ??
        (supabaseUser.user_metadata?.picture as string) ??
        null;
      if (metaAvatar && metaAvatar.startsWith('http')) return metaAvatar;
    }

    // 3. Gravatar fallback (works for any email, returns a generic icon if no Gravatar)
    return gravatarUrl(email);
  }

  private signJwt(userId: string, tenantId: string, role: 'USER' | 'ADMIN' | 'SUPER_ADMIN'): string {
    return this.fastify.jwt.sign({ sub: userId, tenantId, role });
  }

  /**
   * Upsert user by provider ID.
   * If no match by provider ID but email matches an existing user,
   * the provider ID is linked to that account (account linking).
   */
  private async upsertUser(tenantId: string, profile: OAuthProfile) {
    const col = PROVIDER_COL[profile.provider];

    // 1. Look up by this provider's ID
    const { data: byProvider } = await this.supabase
      .from('users')
      .select(USER_FIELDS)
      .eq('tenant_id', tenantId)
      .eq(col, profile.providerId)
      .single();

    if (byProvider) return byProvider;

    // 2. Look up by email — link the new provider to an existing account
    if (profile.email) {
      const { data: byEmail } = await this.supabase
        .from('users')
        .select(USER_FIELDS)
        .eq('tenant_id', tenantId)
        .eq('email', profile.email)
        .single();

      if (byEmail) {
        // Attach this provider ID so next login is found by provider col directly
        await this.supabase
          .from('users')
          .update({ [col]: profile.providerId })
          .eq('id', byEmail.id);
        return byEmail;
      }
    }

    // 3. New user — insert
    const { data: created, error } = await this.supabase
      .from('users')
      .insert({
        tenant_id: tenantId,
        [col]: profile.providerId,
        email: profile.email,
        full_name: profile.fullName,
        avatar_url: profile.avatarUrl ?? null,
        role: 'USER',
        status: 'PENDING_APPROVAL',
      })
      .select(USER_FIELDS)
      .single();

    if (error || !created) throw new Error('Failed to create user: ' + error?.message);
    return created;
  }

  /** Web callback: returns only JWT */
  async findOrCreateUser(profile: OAuthProfile): Promise<string> {
    const tenantId = await this.resolveTenantId();
    const user = await this.upsertUser(tenantId, profile);
    return this.signJwt(user.id, tenantId, user.role);
  }

  /** Mobile exchange: returns JWT + public user fields */
  async findOrCreateUserWithProfile(
    profile: OAuthProfile,
  ): Promise<{ accessToken: string; user: Record<string, unknown> }> {
    const tenantId = await this.resolveTenantId();
    const user = await this.upsertUser(tenantId, profile);
    return {
      accessToken: this.signJwt(user.id, tenantId, user.role),
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        avatarUrl: user.avatar_url ?? null,
        role: user.role,
        status: user.status,
      },
    };
  }

  /**
   * POST /auth/exchange — Supabase token → our custom backend JWT.
   *
   * Called after any Supabase-managed auth (email OTP, Google, Apple).
   * 1. Verifies the Supabase token against Supabase Auth
   * 2. Finds or creates the user in public.users (fallback if trigger didn't run)
   * 3. Returns our signed backend JWT + user profile
   */
  async exchangeSupabaseToken(
    supabaseToken: string,
  ): Promise<{ accessToken: string; user: Record<string, unknown> }> {
    // 1. Verify with Supabase Auth (service role client)
    const { data, error } = await this.supabase.auth.getUser(supabaseToken);

    if (error || !data.user) {
      throw Object.assign(new Error('Invalid or expired Supabase token'), { statusCode: 401 });
    }

    const supabaseUser: SupabaseUser = data.user;
    const tenantId = await this.resolveTenantId();

    // 2. Try looking up by supabase_uid first (fastest path — trigger already ran)
    const { data: existing, error: lookupErr } = await this.supabase
      .from('users')
      .select(USER_FIELDS + ', supabase_uid')
      .eq('supabase_uid', supabaseUser.id)
      .eq('tenant_id', tenantId)
      .single();

    if (!lookupErr && existing) {
      const row = existing as unknown as Record<string, unknown>;
      const avatarUrl = this.resolveAvatarUrl(row.avatar_url as string | null, supabaseUser, row.email as string);

      // Update avatar in DB if it was missing/junk
      if (avatarUrl && avatarUrl !== row.avatar_url) {
        await this.supabase.from('users').update({ avatar_url: avatarUrl }).eq('id', row.id as string);
      }

      return {
        accessToken: this.signJwt(row.id as string, tenantId, row.role as 'USER' | 'ADMIN' | 'SUPER_ADMIN'),
        user: {
          id: row.id,
          fullName: row.full_name,
          email: row.email,
          avatarUrl,
          role: row.role,
          status: row.status,
        },
      };
    }

    // 3. No match by supabase_uid — try email (account linking: user may have
    //    signed in with LinkedIn/Google before and has no supabase_uid yet)
    const email = supabaseUser.email ?? '';

    if (email) {
      const { data: byEmail, error: emailErr } = await this.supabase
        .from('users')
        .select(USER_FIELDS + ', supabase_uid')
        .eq('email', email)
        .eq('tenant_id', tenantId)
        .single();

      if (!emailErr && byEmail) {
        const row = byEmail as unknown as Record<string, unknown>;
        const avatarUrl = this.resolveAvatarUrl(row.avatar_url as string | null, supabaseUser, email);

        // Link supabase_uid + update avatar if missing
        const updates: Record<string, unknown> = {};
        if (!row.supabase_uid) updates.supabase_uid = supabaseUser.id;
        if (avatarUrl && avatarUrl !== row.avatar_url) updates.avatar_url = avatarUrl;
        if (Object.keys(updates).length > 0) {
          await this.supabase.from('users').update(updates).eq('id', row.id as string);
        }

        return {
          accessToken: this.signJwt(row.id as string, tenantId, row.role as 'USER' | 'ADMIN' | 'SUPER_ADMIN'),
          user: {
            id: row.id,
            fullName: row.full_name,
            email: row.email,
            avatarUrl,
            role: row.role,
            status: row.status,
          },
        };
      }
    }

    // 4. Truly new user — create manually
    const fullName =
      (supabaseUser.user_metadata?.full_name as string) ??
      (supabaseUser.user_metadata?.name as string) ??
      email.split('@')[0];
    const avatarUrl = this.resolveAvatarUrl(null, supabaseUser, email);
    const provider = supabaseUser.app_metadata?.provider as string | undefined;

    const insertPayload: Record<string, unknown> = {
      supabase_uid: supabaseUser.id,
      tenant_id: tenantId,
      email,
      full_name: fullName,
      avatar_url: avatarUrl,
      role: 'USER',
      status: 'PENDING_APPROVAL',
    };

    // Also set provider-specific ID for future logins
    if (provider === 'google') {
      insertPayload.google_id = supabaseUser.app_metadata?.identities?.[0]?.id ?? supabaseUser.id;
    } else if (provider === 'apple') {
      insertPayload.apple_id = supabaseUser.app_metadata?.identities?.[0]?.id ?? supabaseUser.id;
    }

    const { data: created, error: insertErr } = await this.supabase
      .from('users')
      .insert(insertPayload)
      .select(USER_FIELDS)
      .single();

    if (insertErr || !created) {
      throw new Error('Failed to create user profile: ' + insertErr?.message);
    }

    const newRow = created as unknown as Record<string, unknown>;
    return {
      accessToken: this.signJwt(newRow.id as string, tenantId, newRow.role as 'USER' | 'ADMIN' | 'SUPER_ADMIN'),
      user: {
        id: newRow.id,
        fullName: newRow.full_name,
        email: newRow.email,
        avatarUrl: (newRow.avatar_url as string | null) ?? null,
        role: newRow.role,
        status: newRow.status,
      },
    };
  }

  /**
   * POST /auth/admin/login — email + password sign-in for admins.
   *
   * 1. Authenticates via Supabase Auth (signInWithPassword)
   * 2. Looks up user in public.users
   * 3. Verifies role is ADMIN or SUPER_ADMIN
   * 4. Returns backend JWT + user profile
   */
  async adminLogin(
    email: string,
    password: string,
  ): Promise<{ accessToken: string; user: Record<string, unknown> }> {
    // 1. Verify credentials with Supabase Auth
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error || !data.session) {
      throw Object.assign(
        new Error(error?.message ?? 'Invalid email or password'),
        { statusCode: 401 },
      );
    }

    const tenantId = await this.resolveTenantId();
    const supabaseUser = data.user;

    // 2. Find user in public.users (by supabase_uid first, then email)
    let row: Record<string, unknown> | null = null;

    const { data: byUid, error: uidErr } = await this.supabase
      .from('users')
      .select(USER_FIELDS + ', supabase_uid')
      .eq('supabase_uid', supabaseUser.id)
      .eq('tenant_id', tenantId)
      .single();

    if (!uidErr && byUid) {
      row = byUid as unknown as Record<string, unknown>;
    } else {
      // Fallback to email lookup + link supabase_uid
      const { data: byEmail, error: emailErr } = await this.supabase
        .from('users')
        .select(USER_FIELDS + ', supabase_uid')
        .eq('email', email.trim().toLowerCase())
        .eq('tenant_id', tenantId)
        .single();

      if (!emailErr && byEmail) {
        row = byEmail as unknown as Record<string, unknown>;
        if (!row.supabase_uid) {
          await this.supabase
            .from('users')
            .update({ supabase_uid: supabaseUser.id })
            .eq('id', row.id as string);
        }
      }
    }

    if (!row) {
      throw Object.assign(
        new Error('No user profile found. Contact a super admin.'),
        { statusCode: 404 },
      );
    }

    // 3. Verify the user has admin privileges
    const role = row.role as string;
    if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
      throw Object.assign(
        new Error('Insufficient permissions. Admin access required.'),
        { statusCode: 403 },
      );
    }

    // 4. Check user isn't blocked
    if (row.status === 'BLOCKED') {
      throw Object.assign(
        new Error('Account is blocked. Contact a super admin.'),
        { statusCode: 403 },
      );
    }

    const avatarUrl = this.resolveAvatarUrl(row.avatar_url as string | null, data.user, row.email as string);

    // Persist avatar if it was resolved fresh
    if (avatarUrl && avatarUrl !== row.avatar_url) {
      await this.supabase.from('users').update({ avatar_url: avatarUrl }).eq('id', row.id as string);
    }

    return {
      accessToken: this.signJwt(row.id as string, tenantId, role as 'ADMIN' | 'SUPER_ADMIN'),
      user: {
        id: row.id,
        fullName: row.full_name,
        email: row.email,
        avatarUrl,
        role: row.role,
        status: row.status,
      },
    };
  }
}
