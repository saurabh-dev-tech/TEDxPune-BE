/**
 * videos.service.ts
 *
 * CRUD for youtube_playlists + youtube_videos tables.
 * Sync logic fetches from YouTube API and upserts into the DB.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { FastifyBaseLogger } from 'fastify';
import {
  extractPlaylistId,
  fetchPlaylistItems,
  fetchVideoDetails,
  fetchPlaylistThumbnail,
} from './youtube.service';

const PLAYLIST_FIELDS = 'id, playlist_name, playlist_id, playlist_url, category, thumbnail_url, display_order, is_active, created_at, updated_at';
const VIDEO_FIELDS = 'id, playlist_ref_id, youtube_video_id, title, description, thumbnail_url, video_url, published_at, duration, is_active, created_at, updated_at';

export interface CreatePlaylistInput {
  playlistName: string;
  playlistUrl: string;        // YouTube URL or raw playlist ID
  category?: string;
  displayOrder?: number;
  isActive?: boolean;
}

export interface UpdatePlaylistInput {
  playlistName?: string;
  playlistUrl?: string;
  category?: string;
  displayOrder?: number;
  isActive?: boolean;
}

export class VideosService {
  private readonly apiKey: string;

  constructor(
    private readonly supabase: SupabaseClient,
    private readonly log: FastifyBaseLogger,
  ) {
    this.apiKey = process.env.YOUTUBE_API_KEY ?? '';
    if (!this.apiKey) {
      this.log.warn('[videos] YOUTUBE_API_KEY not set — sync will fail');
    }
  }

  // ─── Playlist CRUD (Admin) ─────────────────────────────────────────────────

  async createPlaylist(tenantId: string, input: CreatePlaylistInput) {
    const playlistId = extractPlaylistId(input.playlistUrl);

    // Fetch thumbnail from YouTube if API key is available
    let thumbnailUrl: string | null = null;
    if (this.apiKey) {
      thumbnailUrl = await fetchPlaylistThumbnail(playlistId, this.apiKey);
    }

    const { data, error } = await this.supabase
      .from('youtube_playlists')
      .insert({
        tenant_id: tenantId,
        playlist_name: input.playlistName,
        playlist_id: playlistId,
        playlist_url: input.playlistUrl,
        category: input.category ?? 'General',
        thumbnail_url: thumbnailUrl,
        display_order: input.displayOrder ?? 0,
        is_active: input.isActive ?? true,
      })
      .select(PLAYLIST_FIELDS)
      .single();

    if (error) throw new Error('Failed to create playlist: ' + error.message);
    return data;
  }

  async updatePlaylist(tenantId: string, id: string, input: UpdatePlaylistInput) {
    const updates: Record<string, unknown> = {};

    if (input.playlistName !== undefined) updates.playlist_name = input.playlistName;
    if (input.category !== undefined)     updates.category = input.category;
    if (input.displayOrder !== undefined) updates.display_order = input.displayOrder;
    if (input.isActive !== undefined)     updates.is_active = input.isActive;

    if (input.playlistUrl !== undefined) {
      updates.playlist_url = input.playlistUrl;
      updates.playlist_id = extractPlaylistId(input.playlistUrl);
      // Refresh thumbnail
      if (this.apiKey) {
        updates.thumbnail_url = await fetchPlaylistThumbnail(updates.playlist_id as string, this.apiKey);
      }
    }

    if (Object.keys(updates).length === 0) {
      throw Object.assign(new Error('No fields to update'), { statusCode: 400 });
    }

    const { data, error } = await this.supabase
      .from('youtube_playlists')
      .update(updates)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .select(PLAYLIST_FIELDS)
      .single();

    if (error) throw new Error('Failed to update playlist: ' + error.message);
    return data;
  }

  async deletePlaylist(tenantId: string, id: string) {
    // Cascade deletes videos via FK
    const { error } = await this.supabase
      .from('youtube_playlists')
      .delete()
      .eq('id', id)
      .eq('tenant_id', tenantId);

    if (error) throw new Error('Failed to delete playlist: ' + error.message);
  }

  async getPlaylistById(tenantId: string, id: string) {
    const { data, error } = await this.supabase
      .from('youtube_playlists')
      .select(PLAYLIST_FIELDS)
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single();

    if (error || !data) {
      throw Object.assign(new Error('Playlist not found'), { statusCode: 404 });
    }
    return data;
  }

  // ─── Admin: list ALL playlists (including inactive) ────────────────────────

  async listPlaylistsAdmin(tenantId: string) {
    const { data, error } = await this.supabase
      .from('youtube_playlists')
      .select(PLAYLIST_FIELDS)
      .eq('tenant_id', tenantId)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data ?? [];
  }

  // ─── Public: list active playlists ─────────────────────────────────────────

  async listPlaylistsPublic(tenantId: string) {
    const { data, error } = await this.supabase
      .from('youtube_playlists')
      .select('id, playlist_name, category, thumbnail_url, display_order')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) throw new Error(error.message);
    return data ?? [];
  }

  // ─── Public: list videos for a playlist ────────────────────────────────────

  async listVideosByPlaylist(
    tenantId: string,
    playlistRefId: string,
    page: number,
    limit: number,
  ) {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await this.supabase
      .from('youtube_videos')
      .select(VIDEO_FIELDS, { count: 'exact' })
      .eq('playlist_ref_id', playlistRefId)
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('published_at', { ascending: false })
      .range(from, to);

    if (error) throw new Error(error.message);
    return { items: data ?? [], total: count ?? 0, page, limit };
  }

  // ─── Public: single video detail ───────────────────────────────────────────

  async getVideoById(tenantId: string, videoId: string) {
    const { data, error } = await this.supabase
      .from('youtube_videos')
      .select(VIDEO_FIELDS)
      .eq('id', videoId)
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .single();

    if (error || !data) {
      throw Object.assign(new Error('Video not found'), { statusCode: 404 });
    }
    return data;
  }

  // ─── Sync: fetch from YouTube and upsert ───────────────────────────────────

  async syncAllPlaylists(tenantId: string): Promise<{
    playlistsSynced: number;
    videosInserted: number;
    videosUpdated: number;
  }> {
    if (!this.apiKey) {
      throw new Error('YOUTUBE_API_KEY is not configured');
    }

    // Get all active playlists for this tenant
    const { data: playlists, error } = await this.supabase
      .from('youtube_playlists')
      .select('id, playlist_id')
      .eq('tenant_id', tenantId)
      .eq('is_active', true);

    if (error) throw new Error('Failed to fetch playlists: ' + error.message);
    if (!playlists || playlists.length === 0) return { playlistsSynced: 0, videosInserted: 0, videosUpdated: 0 };

    let totalInserted = 0;
    let totalUpdated = 0;

    for (const playlist of playlists) {
      try {
        const result = await this.syncSinglePlaylist(tenantId, playlist.id, playlist.playlist_id);
        totalInserted += result.inserted;
        totalUpdated += result.updated;
      } catch (err) {
        this.log.error(
          { playlistId: playlist.playlist_id, err },
          '[videos] sync failed for playlist',
        );
      }
    }

    return {
      playlistsSynced: playlists.length,
      videosInserted: totalInserted,
      videosUpdated: totalUpdated,
    };
  }

  private async syncSinglePlaylist(
    tenantId: string,
    playlistRefId: string,
    ytPlaylistId: string,
  ): Promise<{ inserted: number; updated: number }> {
    // 1. Fetch all items from YouTube
    const ytItems = await fetchPlaylistItems(ytPlaylistId, this.apiKey);
    if (ytItems.length === 0) return { inserted: 0, updated: 0 };

    // 2. Fetch video details (for duration + fresher metadata)
    const videoIds = ytItems.map(v => v.videoId);
    const details = await fetchVideoDetails(videoIds, this.apiKey);

    // 3. Get existing videos for this playlist from DB
    const { data: existing } = await this.supabase
      .from('youtube_videos')
      .select('id, youtube_video_id, title, thumbnail_url, description')
      .eq('playlist_ref_id', playlistRefId)
      .eq('tenant_id', tenantId);

    const existingMap = new Map(
      (existing ?? []).map((v: Record<string, unknown>) => [v.youtube_video_id as string, v]),
    );

    let inserted = 0;
    let updated = 0;

    for (const item of ytItems) {
      const detail = details.get(item.videoId);
      const videoData = {
        tenant_id: tenantId,
        playlist_ref_id: playlistRefId,
        youtube_video_id: item.videoId,
        title: detail?.title ?? item.title,
        description: detail?.description ?? item.description,
        thumbnail_url: detail?.thumbnailUrl ?? item.thumbnailUrl,
        video_url: item.videoUrl,
        published_at: detail?.publishedAt ?? item.publishedAt,
        duration: detail?.duration ?? null,
        is_active: true,
      };

      const existingVideo = existingMap.get(item.videoId);

      if (!existingVideo) {
        // New video — insert
        const { error: insertErr } = await this.supabase
          .from('youtube_videos')
          .insert(videoData);

        if (insertErr) {
          // Might be a duplicate from another playlist — skip
          if (!insertErr.message.includes('duplicate')) {
            this.log.warn({ videoId: item.videoId, err: insertErr.message }, '[videos] insert failed');
          }
        } else {
          inserted++;
        }
      } else {
        // Existing video — update if metadata changed
        const ev = existingVideo as Record<string, unknown>;
        const needsUpdate =
          ev.title !== videoData.title ||
          ev.thumbnail_url !== videoData.thumbnail_url ||
          ev.description !== videoData.description;

        if (needsUpdate) {
          await this.supabase
            .from('youtube_videos')
            .update({
              title: videoData.title,
              description: videoData.description,
              thumbnail_url: videoData.thumbnail_url,
              duration: videoData.duration,
            })
            .eq('id', ev.id as string);
          updated++;
        }
      }
    }

    this.log.info(
      { ytPlaylistId, inserted, updated, total: ytItems.length },
      '[videos] playlist synced',
    );

    return { inserted, updated };
  }
}
