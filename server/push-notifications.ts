import { db } from "./db";
import { users } from "@shared/schema";
import { inArray } from "drizzle-orm";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

interface ExpoPushMessage {
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

async function sendExpoMessages(messages: ExpoPushMessage[]): Promise<void> {
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
    for (const ticket of tickets) {
      if (ticket.status === "error") {
        console.warn("[Push] Expo push ticket error:", ticket.message, ticket.details?.error);
      }
    }
  } catch (err) {
    console.warn("[Push] Failed to send Expo push notification (non-fatal):", err);
  }
}

export async function sendMatchPushNotifications(userIds: string[]): Promise<void> {
  if (!userIds.length) return;
  try {
    const rows = await db
      .select({ id: users.id, expoPushToken: users.expoPushToken })
      .from(users)
      .where(inArray(users.id, userIds));

    const messages: ExpoPushMessage[] = rows
      .filter((r) => r.expoPushToken && r.expoPushToken.startsWith("ExponentPushToken["))
      .map((r) => ({
        to: r.expoPushToken!,
        title: "Ehi, It's a match! 🔥",
        body: "Tocca per vedere chi è",
        sound: "default" as const,
        data: { type: "match" },
        channelId: "matches",
      }));

    if (messages.length === 0) return;
    await sendExpoMessages(messages);
  } catch (err) {
    console.warn("[Push] sendMatchPushNotifications error (non-fatal):", err);
  }
}
