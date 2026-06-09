// Tipi e helper interni condivisi tra push-notifications.ts e push-notifications-admin.ts.
// Non importare direttamente dall'esterno — usare push-notifications.ts come entry point.
import { db } from "./db";
import { users, userProfiles } from "@shared/db";
import { inArray, eq } from "drizzle-orm";

export type NotificationPrefKey = "matches" | "zoneProposals" | "chat" | "motoclub" | "eventi" | "system_alerts";

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
  channelId?: string;
}

interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export function isValidExpoPushToken(token: string): boolean {
  return token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[");
}

async function clearStaleToken(userId: string): Promise<void> {
  try {
    await db.update(users).set({ expoPushToken: null }).where(eq(users.id, userId));
    console.warn(`[Push] Cleared stale token for user ${userId} (DeviceNotRegistered)`);
  } catch (err) {
    console.warn("[Push] Failed to clear stale token (non-fatal):", err);
  }
}

export async function sendExpoMessages(
  messages: ExpoPushMessage[],
  userIdByToken: Map<string, string>,
): Promise<void> {
  try {
    const resp = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(messages),
    });
    if (!resp.ok) {
      console.warn("[Push] Expo push HTTP error:", resp.status, await resp.text().catch(() => ""));
      return;
    }
    const result = await resp.json() as { data?: ExpoPushTicket[] };
    const tickets = result.data ?? [];
    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      if (ticket.status === "error") {
        if (ticket.details?.error === "DeviceNotRegistered") {
          const token = messages[i]?.to;
          if (token) {
            const userId = userIdByToken.get(token);
            if (userId) clearStaleToken(userId);
          }
        } else {
          console.warn("[Push] Expo push ticket error:", ticket.message, ticket.details?.error);
        }
      }
    }
  } catch (err) {
    console.warn("[Push] Failed to send Expo push notification (non-fatal):", err);
  }
}

export async function filterUserIdsByPreference(
  userIds: string[],
  prefKey: NotificationPrefKey,
): Promise<string[]> {
  if (!userIds.length) return [];
  try {
    const rows = await db
      .select({
        userId: userProfiles.userId,
        prefs: userProfiles.notificationPreferences,
        pushNotificationsEnabled: userProfiles.pushNotificationsEnabled,
      })
      .from(userProfiles)
      .where(inArray(userProfiles.userId, userIds));

    const disabledSet = new Set<string>();
    for (const row of rows) {
      if (row.pushNotificationsEnabled === false) {
        disabledSet.add(row.userId);
        continue;
      }
      const prefs = row.prefs as Record<string, boolean> | null;
      if (prefs && prefs[prefKey] === false) {
        disabledSet.add(row.userId);
      }
    }
    return userIds.filter((id) => !disabledSet.has(id));
  } catch (err) {
    console.warn("[Push] filterUserIdsByPreference error (non-fatal):", err);
    return [];
  }
}
