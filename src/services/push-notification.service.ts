import type { SupabaseClient } from '@supabase/supabase-js';
import { Expo, type ExpoPushMessage } from 'expo-server-sdk';

const expo = new Expo();

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export async function sendPushToAllUsers(
  supabase: SupabaseClient,
  payload: PushNotificationPayload,
): Promise<void> {
  console.log('[push-notification] sendPushToAllUsers triggered with payload:', payload);
  try {
    // 1. Save notification into database for all active users (In-App Notification Inbox)
    const { data: users, error: usersErr } = await supabase
      .from('users')
      .select('id')
      .eq('status', 'ACTIVE');

    if (usersErr) {
      console.error('[push-notification] Error fetching active users:', usersErr.message);
    } else {
      console.log(`[push-notification] Found ${users?.length ?? 0} active users`);
    }

    if (users && users.length > 0) {
      const notificationRows = users.map(u => ({
        user_id: u.id,
        title: payload.title,
        body: payload.body,
        type: 'ANNOUNCEMENT',
        data: payload.data ?? {},
        is_read: false,
      }));

      const { data: inserted, error: insertErr } = await supabase
        .from('notifications')
        .insert(notificationRows)
        .select();

      if (insertErr) {
        console.error('[push-notification] Failed to insert in-app notifications:', insertErr.message);
      } else {
        console.log(`[push-notification] Successfully inserted ${inserted?.length ?? 0} notifications into DB`);
      }
    }

    // 2. Dispatch Expo Push Banner to physical devices
    const { data: records, error } = await supabase
      .from('user_push_tokens')
      .select('push_token');

    if (error || !records || records.length === 0) {
      return;
    }

    const messages: ExpoPushMessage[] = [];
    for (const r of records) {
      const token = r.push_token as string;
      if (Expo.isExpoPushToken(token)) {
        messages.push({
          to: token,
          sound: 'default',
          title: payload.title,
          body: payload.body,
          data: payload.data,
        });
      }
    }

    if (messages.length === 0) return;

    const chunks = expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      try {
        await expo.sendPushNotificationsAsync(chunk);
      } catch (err) {
        console.error('[push-notification] Error sending chunk:', err);
      }
    }
  } catch (err) {
    console.error('[push-notification] Failed to process push notifications:', err);
  }
}
