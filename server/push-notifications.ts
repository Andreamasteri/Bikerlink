import { db } from "./db";
import { users } from "@shared/schema";
import { inArray, eq } from "drizzle-orm";
import it from "../lib/i18n/it";

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

function isValidExpoPushToken(token: string): boolean {
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

async function sendExpoMessages(
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

export async function sendMatchPushNotifications(userIds: string[]): Promise<void> {
  if (!userIds.length) return;
  try {
    const rows = await db
      .select({ id: users.id, expoPushToken: users.expoPushToken })
      .from(users)
      .where(inArray(users.id, userIds));

    const userIdByToken = new Map<string, string>();
    const messages: ExpoPushMessage[] = [];

    for (const row of rows) {
      if (row.expoPushToken && isValidExpoPushToken(row.expoPushToken)) {
        userIdByToken.set(row.expoPushToken, row.id);
        messages.push({
          to: row.expoPushToken,
          title: it["push.match.title"] ?? "Ehi, hai un match! 🔥",
          body: it["push.match.body"] ?? "Tocca per vedere chi è",
          sound: "default" as const,
          data: { type: "match" },
          channelId: "matches",
        });
      }
    }

    if (messages.length === 0) return;
    await sendExpoMessages(messages, userIdByToken);
  } catch (err) {
    console.warn("[Push] sendMatchPushNotifications error (non-fatal):", err);
  }
}

export async function sendZoneProposalPushNotifications(userIds: string[]): Promise<void> {
  if (!userIds.length) return;
  try {
    const rows = await db
      .select({ id: users.id, expoPushToken: users.expoPushToken })
      .from(users)
      .where(inArray(users.id, userIds));

    const userIdByToken = new Map<string, string>();
    const messages: ExpoPushMessage[] = [];

    for (const row of rows) {
      if (row.expoPushToken && isValidExpoPushToken(row.expoPushToken)) {
        userIdByToken.set(row.expoPushToken, row.id);
        messages.push({
          to: row.expoPushToken,
          title: it["push.zoneProposal.title"] ?? "C'è una proposta nella tua zona! 🏍️",
          body: it["push.zoneProposal.body"] ?? "Apri BikerLink per scoprirla",
          sound: "default" as const,
          data: { type: "zone_proposal" },
          channelId: "matches",
        });
      }
    }

    if (messages.length === 0) return;
    await sendExpoMessages(messages, userIdByToken);
  } catch (err) {
    console.warn("[Push] sendZoneProposalPushNotifications error (non-fatal):", err);
  }
}
