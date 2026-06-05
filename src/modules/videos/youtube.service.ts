/**
 * youtube.service.ts
 *
 * Fetches playlist items and video details from YouTube Data API v3.
 * Handles pagination (playlists can have 200+ items) and batches
 * video detail calls (50 per request — API max).
 */

import axios from 'axios';

const YT_API = 'https://www.googleapis.com/youtube/v3';

export interface YtVideoItem {
  videoId: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  videoUrl: string;
  publishedAt: string;
}

export interface YtVideoDetail extends YtVideoItem {
  duration: string; // ISO 8601 e.g. "PT4M13S"
}

/**
 * Extract the playlist ID from various URL formats:
 *   https://www.youtube.com/playlist?list=PLxxx
 *   https://youtube.com/playlist?list=PLxxx
 *   PLxxx  (raw ID)
 */
export function extractPlaylistId(input: string): string {
  const trimmed = input.trim();

  // Already a raw playlist ID
  if (/^[A-Za-z0-9_-]{10,}$/.test(trimmed) && !trimmed.includes('/')) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    const listParam = url.searchParams.get('list');
    if (listParam) return listParam;
  } catch {
    // Not a URL — treat as raw ID
  }

  return trimmed;
}

/**
 * Fetch all video items from a YouTube playlist (handles pagination).
 */
export async function fetchPlaylistItems(
  playlistId: string,
  apiKey: string,
): Promise<YtVideoItem[]> {
  const items: YtVideoItem[] = [];
  let pageToken: string | undefined;

  do {
    const { data } = await axios.get(`${YT_API}/playlistItems`, {
      params: {
        part: 'snippet',
        playlistId,
        maxResults: 50,
        pageToken,
        key: apiKey,
      },
    });

    for (const item of data.items ?? []) {
      const snippet = item.snippet;
      const videoId = snippet?.resourceId?.videoId;
      if (!videoId) continue;

      items.push({
        videoId,
        title: snippet.title ?? '',
        description: snippet.description ?? '',
        thumbnailUrl:
          snippet.thumbnails?.maxres?.url ??
          snippet.thumbnails?.high?.url ??
          snippet.thumbnails?.medium?.url ??
          snippet.thumbnails?.default?.url ??
          '',
        videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
        publishedAt: snippet.publishedAt ?? new Date().toISOString(),
      });
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return items;
}

/**
 * Fetch video details (duration, updated metadata) for up to N video IDs.
 * YouTube allows max 50 IDs per request, so we batch automatically.
 */
export async function fetchVideoDetails(
  videoIds: string[],
  apiKey: string,
): Promise<Map<string, YtVideoDetail>> {
  const result = new Map<string, YtVideoDetail>();
  const chunks = chunkArray(videoIds, 50);

  for (const chunk of chunks) {
    const { data } = await axios.get(`${YT_API}/videos`, {
      params: {
        part: 'snippet,contentDetails',
        id: chunk.join(','),
        key: apiKey,
      },
    });

    for (const item of data.items ?? []) {
      const snippet = item.snippet;
      result.set(item.id, {
        videoId: item.id,
        title: snippet?.title ?? '',
        description: snippet?.description ?? '',
        thumbnailUrl:
          snippet?.thumbnails?.maxres?.url ??
          snippet?.thumbnails?.high?.url ??
          snippet?.thumbnails?.medium?.url ??
          '',
        videoUrl: `https://www.youtube.com/watch?v=${item.id}`,
        publishedAt: snippet?.publishedAt ?? '',
        duration: item.contentDetails?.duration ?? '',
      });
    }
  }

  return result;
}

/**
 * Fetch the playlist's own thumbnail (from the playlist resource itself).
 */
export async function fetchPlaylistThumbnail(
  playlistId: string,
  apiKey: string,
): Promise<string | null> {
  try {
    const { data } = await axios.get(`${YT_API}/playlists`, {
      params: {
        part: 'snippet',
        id: playlistId,
        key: apiKey,
      },
    });
    const snippet = data.items?.[0]?.snippet;
    return (
      snippet?.thumbnails?.maxres?.url ??
      snippet?.thumbnails?.high?.url ??
      snippet?.thumbnails?.medium?.url ??
      null
    );
  } catch {
    return null;
  }
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
