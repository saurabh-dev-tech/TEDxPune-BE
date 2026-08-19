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
  try {
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
