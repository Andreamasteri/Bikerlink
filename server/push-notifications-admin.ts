// overflow di server/push-notifications.ts — funzioni push admin/GPS
// Re-esportate dal file originale per compatibilità import.
import { db } from "./db";
import { users } from "@shared/db";
import { inArray, eq } from "drizzle-orm";
import {
  ExpoPushMessage,
  isValidExpoPushToken,
  sendExpoMessages,
  filterUserIdsByPreference,
  getAppPushTokens,
} from "./push-notifications-internal";

export async function sendModeratorReportPush(opts: {
  reportedNickname: string;
  category: string;
  severity: string;
  reportedUserId: string;
  reportId: string;
}): Promise<void> {
  try {
    const modRows = await db
      .select({ id: users.id, expoPushToken: users.expoPushToken })
      .from(users)
      .where(inArray(users.role, ["admin", "moderator"]));
    const userIdByToken = new Map<string, string>();
    const msgs: ExpoPushMessage[] = [];
    const sevIcon = opts.severity === "critical" ? "🚨"
      : opts.severity === "high" ? "⚠️"
      : "📢";
    for (const row of modRows) {
      if (row.expoPushToken && isValidExpoPushToken(row.expoPushToken)) {
        userIdByToken.set(row.expoPushToken, row.id);
        msgs.push({
          to: row.expoPushToken,
          title: `${sevIcon} Nuova segnalazione (${opts.severity})`,
          body: `${opts.reportedNickname} — categoria: ${opts.category}`,
          sound: "default" as const,
          data: {
            type: "moderator_report",
            reportId: opts.reportId,
            reportedUserId: opts.reportedUserId,
            severity: opts.severity,
          },
          channelId: "matches",
        });
      }
    }
    if (msgs.length === 0) return;
    await sendExpoMessages(msgs, userIdByToken);
  } catch (err) {
    console.warn("[Push] sendModeratorReportPush error (non-fatal):", err);
  }
}

export async function sendGpsRejectionAlertToAdmins(
  offenderNickname: string,
  rejectionCount: number,
  targetUserId: string,
): Promise<void> {
  try {
    const adminRows = await db
      .select({ id: users.id, expoPushToken: users.expoPushToken })
      .from(users)
      .where(eq(users.role, "admin"));

    const userIdByToken = new Map<string, string>();
    const msgs: ExpoPushMessage[] = [];

    for (const row of adminRows) {
      if (row.expoPushToken && isValidExpoPushToken(row.expoPushToken)) {
        userIdByToken.set(row.expoPushToken, row.id);
        msgs.push({
          to: row.expoPushToken,
          title: "⚠️ GPS anomalo rilevato",
          body: `${offenderNickname} ha superato ${rejectionCount} rifiuti GPS`,
          sound: "default" as const,
          data: { type: "gps_rejection_alert", targetUserId },
          channelId: "matches",
        });
      }
    }

    if (msgs.length === 0) return;
    await sendExpoMessages(msgs, userIdByToken);
  } catch (err) {
    console.warn("[Push] sendGpsRejectionAlertToAdmins error (non-fatal):", err);
  }
}

export async function sendSystemAlertPushToAdmins(
  title: string,
  body: string,
  data: Record<string, unknown>,
): Promise<number> {
  try {
    const adminRows = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, "admin"));

    const adminIds = adminRows.map((r) => r.id);
    if (adminIds.length === 0) return 0;

    const filteredIds = await filterUserIdsByPreference(adminIds, "system_alerts");
    if (filteredIds.length === 0) return 0;

    const userIdByToken = new Map<string, string>();
    const messages: ExpoPushMessage[] = [];
    const seenTokens = new Set<string>();

    // Primary: read from push_tokens table (app_id="main") — fonte di verità
    // per le registrazioni effettuate dopo l'introduzione del sistema per-app.
    // Un admin con più device compare una volta per device registrato.
    const appTokenRows = await getAppPushTokens(filteredIds, "main");
    for (const t of appTokenRows) {
      if (!seenTokens.has(t.token)) {
        seenTokens.add(t.token);
        userIdByToken.set(t.token, t.userId);
        messages.push({
          to: t.token,
          title,
          body,
          sound: "default" as const,
          data,
          channelId: "matches",
        });
      }
    }

    // Fallback: users.expoPushToken (campo legacy) per i device registrati prima
    // che push_tokens fosse introdotto, o se la riga push_tokens è mancante.
    // dedup tramite seenTokens per non inviare due push allo stesso token.
    const legacyRows = await db
      .select({ id: users.id, expoPushToken: users.expoPushToken })
      .from(users)
      .where(inArray(users.id, filteredIds));
    for (const row of legacyRows) {
      if (
        row.expoPushToken &&
        isValidExpoPushToken(row.expoPushToken) &&
        !seenTokens.has(row.expoPushToken)
      ) {
        seenTokens.add(row.expoPushToken);
        userIdByToken.set(row.expoPushToken, row.id);
        messages.push({
          to: row.expoPushToken,
          title,
          body,
          sound: "default" as const,
          data,
          channelId: "matches",
        });
      }
    }

    if (messages.length === 0) return 0;
    await sendExpoMessages(messages, userIdByToken);
    return messages.length;
  } catch (err) {
    console.warn("[Push] sendSystemAlertPushToAdmins error (non-fatal):", err);
    return 0;
  }
}

export async function sendOtaPendingApprovalPushToAdmins(version: string): Promise<void> {
  try {
    const adminRows = await db
      .select({ id: users.id, expoPushToken: users.expoPushToken })
      .from(users)
      .where(eq(users.role, "admin"));

    const userIdByToken = new Map<string, string>();
    const msgs: ExpoPushMessage[] = [];

    for (const row of adminRows) {
      if (row.expoPushToken && isValidExpoPushToken(row.expoPushToken)) {
        userIdByToken.set(row.expoPushToken, row.id);
        msgs.push({
          to: row.expoPushToken,
          title: `OTA v${version} pronta`,
          body: "Apri il Profilo per distribuirla",
          sound: "default" as const,
          data: { type: "ota_pending_approval", version },
          channelId: "matches",
        });
      }
    }

    if (msgs.length === 0) return;
    await sendExpoMessages(msgs, userIdByToken);
  } catch (err) {
    console.warn("[Push] sendOtaPendingApprovalPushToAdmins error (non-fatal):", err);
  }
}

export async function sendAdminGpsAlertPush(opts: {
  userId: string;
  nickname: string | null;
  deviceId: string;
  rejectionCount: number;
}): Promise<void> {
  try {
    const adminRows = await db
      .select({ id: users.id, expoPushToken: users.expoPushToken })
      .from(users)
      .where(eq(users.role, "admin"));

    const userIdByToken = new Map<string, string>();
    const messages: ExpoPushMessage[] = [];
    const display = opts.nickname ?? opts.userId.slice(0, 8) + "…";

    for (const row of adminRows) {
      if (row.expoPushToken && isValidExpoPushToken(row.expoPushToken)) {
        userIdByToken.set(row.expoPushToken, row.id);
        messages.push({
          to: row.expoPushToken,
          title: "⚠️ GPS Anomalie",
          body: `${display} ha raggiunto ${opts.rejectionCount} rifiuti GPS`,
          sound: "default" as const,
          data: { type: "gps_alert", targetUserId: opts.userId },
          channelId: "matches",
        });
      }
    }

    if (messages.length === 0) return;
    await sendExpoMessages(messages, userIdByToken);
  } catch (err) {
    console.warn("[Push] sendAdminGpsAlertPush error (non-fatal):", err);
  }
}
