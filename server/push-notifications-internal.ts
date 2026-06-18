// Tipi e helper interni condivisi tra push-notifications.ts e push-notifications-admin.ts.
// Non importare direttamente dall'esterno — usare push-notifications.ts come entry point.
import { db } from "./db";
import { users, userProfiles } from "@shared/db";
import { inArray, eq, sql } from "drizzle-orm";

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

// Task #4436: ogni invio push (riuscito o fallito) viene registrato in
// notification_history così la probe diagnostica "Notifiche Push" ha dati reali
// invece di restare a 0 (che faceva apparire la pipeline come ghost/rotta).
export async function recordNotificationHistory(
  rows: Array<{ userId: string | null; notificationType: string; token: string; status: string; errorMessage?: string }>,
): Promise<void> {
  if (!rows.length) return;
  try {
    for (const v of rows) {
      await db.execute(sql`
        INSERT INTO notification_history (user_id, notification_type, token, status, error_message)
        VALUES (${v.userId}, ${v.notificationType}, ${v.token}, ${v.status}, ${v.errorMessage ?? null})
      `);
    }
  } catch (err) {
    console.warn("[Push] recordNotificationHistory failed (non-fatal):", err);
  }
}

function notificationTypeOf(msg: ExpoPushMessage): string {
  const t = (msg.data as Record<string, unknown> | undefined)?.type;
  return typeof t === "string" && t.length > 0 ? t : "unknown";
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
      const errText = await resp.text().catch(() => "");
      console.warn("[Push] Expo push HTTP error:", resp.status, errText);
      await recordNotificationHistory(
        messages.map((m) => ({
          userId: userIdByToken.get(m.to) ?? null,
          notificationType: notificationTypeOf(m),
          token: m.to,
          status: "failed",
          errorMessage: `HTTP ${resp.status}`,
        })),
      );
      return;
    }
    const result = await resp.json() as { data?: ExpoPushTicket[] };
    const tickets = result.data ?? [];
    const historyRows: Array<{ userId: string | null; notificationType: string; token: string; status: string; errorMessage?: string }> = [];
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const ticket = tickets[i];
      // Ticket assente (Expo ha restituito meno ticket dei messaggi) = fallito,
      // non un invio riuscito: altrimenti sovra-stimeremmo gli invii "sent".
      if (!ticket) {
        console.warn("[Push] Expo push: ticket mancante per il messaggio", i);
        historyRows.push({
          userId: userIdByToken.get(msg.to) ?? null,
          notificationType: notificationTypeOf(msg),
          token: msg.to,
          status: "failed",
          errorMessage: "ticket mancante nella risposta Expo",
        });
      } else if (ticket.status === "error") {
        if (ticket.details?.error === "DeviceNotRegistered") {
          const userId = userIdByToken.get(msg.to);
          if (userId) clearStaleToken(userId);
        } else {
          console.warn("[Push] Expo push ticket error:", ticket.message, ticket.details?.error);
        }
        historyRows.push({
          userId: userIdByToken.get(msg.to) ?? null,
          notificationType: notificationTypeOf(msg),
          token: msg.to,
          status: "failed",
          errorMessage: ticket.details?.error ?? ticket.message ?? "ticket error",
        });
      } else {
        historyRows.push({
          userId: userIdByToken.get(msg.to) ?? null,
          notificationType: notificationTypeOf(msg),
          token: msg.to,
          status: "sent",
        });
      }
    }
    await recordNotificationHistory(historyRows);
  } catch (err) {
    console.warn("[Push] Failed to send Expo push notification (non-fatal):", err);
    // Anche su errore di rete registriamo l'intero batch come fallito, altrimenti
    // lo storico (e la probe Notifiche della Radiografia) resta a 0 righe.
    await recordNotificationHistory(
      messages.map((m) => ({
        userId: userIdByToken.get(m.to) ?? null,
        notificationType: notificationTypeOf(m),
        token: m.to,
        status: "failed",
        errorMessage: `network error: ${err instanceof Error ? err.message : String(err)}`,
      })),
    );
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
