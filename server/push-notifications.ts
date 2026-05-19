import { db } from "./db";
import { users, userProfiles } from "@shared/schema";
import { inArray, eq } from "drizzle-orm";
import it from "../lib/i18n/it";

type NotificationPrefKey = "matches" | "zoneProposals" | "chat" | "motoclub" | "eventi";

async function filterUserIdsByPreference(
  userIds: string[],
  prefKey: NotificationPrefKey,
): Promise<string[]> {
  if (!userIds.length) return [];
  try {
    const rows = await db
      .select({
        userId: userProfiles.userId,
        prefs: userProfiles.notificationPreferences,
      })
      .from(userProfiles)
      .where(inArray(userProfiles.userId, userIds));

    // Only opt-out is honored. Users without a profile row (legacy/edge cases)
    // or with no stored prefs default to allowed, matching the column default
    // {matches:true, zoneProposals:true, chat:true, motoclub:true, eventi:true}.
    // Only explicit `false` skips the push.
    const prefByUser = new Map<string, typeof rows[number]["prefs"]>();
    for (const r of rows) {
      prefByUser.set(r.userId, r.prefs);
    }
    return userIds.filter((id) => {
      const p = prefByUser.get(id);
      if (!p) return true;
      return p[prefKey] !== false;
    });
  } catch (err) {
    console.warn("[Push] filterUserIdsByPreference error — failing closed, no push sent:", err);
    return [];
  }
}

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
    const filteredIds = await filterUserIdsByPreference(userIds, "matches");
    if (!filteredIds.length) return;
    const rows = await db
      .select({ id: users.id, expoPushToken: users.expoPushToken })
      .from(users)
      .where(inArray(users.id, filteredIds));

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

export async function sendChatPushNotifications(
  userIds: string[],
  opts: { senderNickname: string; preview: string; conversationId: string },
): Promise<void> {
  if (!userIds.length) return;
  try {
    const filteredIds = await filterUserIdsByPreference(userIds, "chat");
    if (!filteredIds.length) return;
    const rows = await db
      .select({ id: users.id, expoPushToken: users.expoPushToken })
      .from(users)
      .where(inArray(users.id, filteredIds));

    const userIdByToken = new Map<string, string>();
    const messages: ExpoPushMessage[] = [];

    for (const row of rows) {
      if (row.expoPushToken && isValidExpoPushToken(row.expoPushToken)) {
        userIdByToken.set(row.expoPushToken, row.id);
        messages.push({
          to: row.expoPushToken,
          title: `Nuovo messaggio da ${opts.senderNickname}`,
          body: opts.preview || "Apri BikerLink per leggere",
          sound: "default" as const,
          data: { type: "chat", conversationId: opts.conversationId },
          channelId: "matches",
        });
      }
    }

    if (messages.length === 0) return;
    await sendExpoMessages(messages, userIdByToken);
  } catch (err) {
    console.warn("[Push] sendChatPushNotifications error (non-fatal):", err);
  }
}

export async function sendZoneProposalPushNotifications(userIds: string[]): Promise<void> {
  if (!userIds.length) return;
  try {
    const filteredIds = await filterUserIdsByPreference(userIds, "zoneProposals");
    if (!filteredIds.length) return;
    const rows = await db
      .select({ id: users.id, expoPushToken: users.expoPushToken })
      .from(users)
      .where(inArray(users.id, filteredIds));

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

export async function sendMotoclubPushNotifications(
  userIds: string[],
  opts: { title: string; body: string; clubId?: string },
): Promise<void> {
  if (!userIds.length) return;
  try {
    const filteredIds = await filterUserIdsByPreference(userIds, "motoclub");
    if (!filteredIds.length) return;
    const rows = await db
      .select({ id: users.id, expoPushToken: users.expoPushToken })
      .from(users)
      .where(inArray(users.id, filteredIds));

    const userIdByToken = new Map<string, string>();
    const messages: ExpoPushMessage[] = [];

    for (const row of rows) {
      if (row.expoPushToken && isValidExpoPushToken(row.expoPushToken)) {
        userIdByToken.set(row.expoPushToken, row.id);
        messages.push({
          to: row.expoPushToken,
          title: opts.title,
          body: opts.body,
          sound: "default" as const,
          data: { type: "motoclub", clubId: opts.clubId },
          channelId: "motoclub",
        });
      }
    }

    if (messages.length === 0) return;
    await sendExpoMessages(messages, userIdByToken);
  } catch (err) {
    console.warn("[Push] sendMotoclubPushNotifications error (non-fatal):", err);
  }
}

export async function sendEventiPushNotifications(
  userIds: string[],
  opts: { title: string; body: string; eventId?: string },
): Promise<void> {
  if (!userIds.length) return;
  try {
    const filteredIds = await filterUserIdsByPreference(userIds, "eventi");
    if (!filteredIds.length) return;
    const rows = await db
      .select({ id: users.id, expoPushToken: users.expoPushToken })
      .from(users)
      .where(inArray(users.id, filteredIds));

    const userIdByToken = new Map<string, string>();
    const messages: ExpoPushMessage[] = [];

    for (const row of rows) {
      if (row.expoPushToken && isValidExpoPushToken(row.expoPushToken)) {
        userIdByToken.set(row.expoPushToken, row.id);
        messages.push({
          to: row.expoPushToken,
          title: opts.title,
          body: opts.body,
          sound: "default" as const,
          data: { type: "evento", eventId: opts.eventId },
          channelId: "eventi",
        });
      }
    }

    if (messages.length === 0) return;
    await sendExpoMessages(messages, userIdByToken);
  } catch (err) {
    console.warn("[Push] sendEventiPushNotifications error (non-fatal):", err);
  }
}
