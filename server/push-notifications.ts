import { db } from "./db";
import { users, userProfiles, appSettings, matchPreferences } from "@shared/db";
import { inArray, eq } from "drizzle-orm";
import it from "../lib/i18n/it";
import {
  ExpoPushMessage,
  isValidExpoPushToken,
  sendExpoMessages,
  filterUserIdsByPreference,
  recordNotificationHistory,
  getAppPushTokens,
  clearStalePushTokenRow,
  getBowieDeviceToken,
  clearStaleBowieDeviceToken,
} from "./push-notifications-internal";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

async function clearStaleToken(userId: string): Promise<void> {
  try {
    await db.update(users).set({ expoPushToken: null }).where(eq(users.id, userId));
    console.warn(`[Push] Cleared stale token for user ${userId} (DeviceNotRegistered)`);
  } catch (err) {
    console.warn("[Push] Failed to clear stale token (non-fatal):", err);
  }
}

export async function sendMatchPushNotifications(
  userIds: string[],
  opts?: { matchName?: string; thumbnailUrl?: string },
): Promise<void> {
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
        const extraData: Record<string, string> = {};
        if (opts?.matchName) extraData.matchName = opts.matchName;
        if (opts?.thumbnailUrl) extraData.thumbnailUrl = opts.thumbnailUrl;
        messages.push({
          to: row.expoPushToken,
          title: it["push.match.title"] ?? "Ehi, hai un match! 🔥",
          body: it["push.match.body"] ?? "Tocca per vedere chi è",
          sound: "default" as const,
          data: { type: "match", ...extraData },
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

export async function sendZoneMatchedPushNotifications(userIds: string[]): Promise<void> {
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
          title: "Proposta abbinata nella tua zona! 🏍️🔥",
          body: "Una proposta vicina a te ha trovato match — creane una tu!",
          sound: "default" as const,
          data: { type: "zone_matched" },
          channelId: "matches",
        });
      }
    }

    if (messages.length === 0) return;
    await sendExpoMessages(messages, userIdByToken);
  } catch (err) {
    console.warn("[Push] sendZoneMatchedPushNotifications error (non-fatal):", err);
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

export async function getGpsRejectionThreshold(): Promise<number> {
  try {
    const [row] = await db
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, "gps_rejection_alert_threshold"))
      .limit(1);
    if (row?.value) {
      const parsed = parseInt(row.value, 10);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  } catch (err) {
    console.warn("[Push] Failed to get GPS rejection threshold:", err);
  }
  return 100;
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

export async function sendWeeklyRecapPushNotifications(userIds: string[]): Promise<number> {
  if (!userIds.length) return 0;
  try {
    const rows = await db
      .select({
        id: users.id,
        expoPushToken: users.expoPushToken,
        pushEnabled: userProfiles.pushNotificationsEnabled,
      })
      .from(users)
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(inArray(users.id, userIds));

    const userIdByToken = new Map<string, string>();
    const messages: ExpoPushMessage[] = [];

    for (const row of rows) {
      if (row.pushEnabled === false) continue;
      if (row.expoPushToken && isValidExpoPushToken(row.expoPushToken)) {
        userIdByToken.set(row.expoPushToken, row.id);
        messages.push({
          to: row.expoPushToken,
          title: "La tua settimana su BikerLink",
          body: "5 biker da non perdere — apri il recap",
          sound: "default" as const,
          data: { type: "weekly_recap" },
          channelId: "matches",
        });
      }
    }

    if (messages.length === 0) return 0;
    await sendExpoMessages(messages, userIdByToken);
    return messages.length;
  } catch (err) {
    console.warn("[Push] sendWeeklyRecapPushNotifications error (non-fatal):", err);
    return 0;
  }
}

export async function sendDrivingStyleChangePushNotification(
  userId: string,
  opts: { title: string; body: string },
): Promise<number> {
  try {
    const filteredIds = await filterUserIdsByPreference([userId], "matches");
    if (!filteredIds.length) return 0;
    const [row] = await db
      .select({ id: users.id, expoPushToken: users.expoPushToken })
      .from(users)
      .where(eq(users.id, userId));

    if (!row?.expoPushToken || !isValidExpoPushToken(row.expoPushToken)) return 0;

    const userIdByToken = new Map([[row.expoPushToken, row.id]]);
    await sendExpoMessages(
      [{
        to: row.expoPushToken,
        title: opts.title,
        body: opts.body,
        sound: "default" as const,
        data: { type: "driving_style_changed" },
        channelId: "matches",
      }],
      userIdByToken,
    );
    return 1;
  } catch (err) {
    console.warn("[Push] sendDrivingStyleChangePushNotification error (non-fatal):", err);
    return 0;
  }
}

// Task #5222 — Bowie Terminal: rispedisce la risposta dell'AI come push
// notification (usato dalla quick-reply della notifica Android persistente).
// NON passa per filterUserIdsByPreference: è una risposta diretta richiesta
// esplicitamente dall'utente nel terminale, non una notifica promozionale.
export async function sendBowieReplyPush(
  userId: string,
  opts: { body: string; persona?: { id: string; name: string }; deviceId?: string },
): Promise<number> {
  try {
    // Task #5277: se conosciamo il device che ha originato la richiesta (quick-
    // reply Bowie Terminal), consegniamo SOLO a quello — non a tutti i device
    // Bowie dell'utente — e mai a un device revocato dall'admin (la lookup
    // esclude revoked_at). Senza deviceId (client vecchi, o richieste dall'app
    // principale) si torna al broadcast per app_id="bowie" di prima.
    let tokens: Array<{ userId: string; token: string }>;
    if (opts.deviceId) {
      const deviceToken = await getBowieDeviceToken(userId, opts.deviceId);
      tokens = deviceToken ? [{ userId, token: deviceToken }] : [];
    } else {
      // Task #5273: la risposta Bowie va SOLO ai token registrati dalla Bowie
      // Terminal (app_id="bowie"), non a users.expoPushToken (che appartiene
      // all'app principale). Così le due app non si rubano più le notifiche.
      tokens = await getAppPushTokens([userId], "bowie");
    }
    if (!tokens.length) return 0;

    const personaName = opts.persona?.name ?? "Bowie";
    const userIdByToken = new Map(tokens.map((t) => [t.token, t.userId]));
    const messages = tokens.map((t) => ({
      to: t.token,
      title: personaName,
      body: opts.body.slice(0, 500),
      sound: "default" as const,
      data: { type: "bowie_reply", persona: opts.persona?.id ?? "bowie" },
      channelId: "bowie",
    }));
    await sendExpoMessages(messages, userIdByToken, {
      onDeviceNotRegistered: (token) =>
        opts.deviceId ? clearStaleBowieDeviceToken(token) : clearStalePushTokenRow(token),
    });
    return messages.length;
  } catch (err) {
    console.warn("[Push] sendBowieReplyPush error (non-fatal):", err);
    return 0;
  }
}

// Task #5304 — segnale push data-only (nessun banner) inviato a TUTTI i device
// Bowie Terminal registrati per l'utente quando l'app principale BikerLink va
// in foreground. Rende l'auto-chiusura del terminale quasi istantanea invece
// di attendere il prossimo poll (fino a 50s). Best-effort: se non ci sono
// token registrati o l'invio fallisce, il poll periodico resta il fallback.
export async function sendBowieCloseSignalPush(userId: string): Promise<number> {
  try {
    const tokens = await getAppPushTokens([userId], "bowie");
    if (!tokens.length) return 0;

    const userIdByToken = new Map(tokens.map((t) => [t.token, t.userId]));
    const messages = tokens.map((t) => ({
      to: t.token,
      data: { type: "main_app_foreground_close" },
      sound: null,
      channelId: "bowie",
    }));
    await sendExpoMessages(messages, userIdByToken, {
      onDeviceNotRegistered: (token) => clearStalePushTokenRow(token),
    });
    return messages.length;
  } catch (err) {
    console.warn("[Push] sendBowieCloseSignalPush error (non-fatal):", err);
    return 0;
  }
}

export async function sendPlannedRouteInvitePushNotifications(
  userIds: string[],
  opts: { routeId: string },
): Promise<string[]> {
  if (!userIds.length) return [];
  try {
    const afterMatchesPref = await filterUserIdsByPreference(userIds, "matches");
    if (!afterMatchesPref.length) return [];

    const prefRows = await db
      .select({ userId: matchPreferences.userId, allowed: matchPreferences.plannedRouteInvite })
      .from(matchPreferences)
      .where(inArray(matchPreferences.userId, afterMatchesPref));
    const allowMap = new Map<string, boolean>();
    for (const r of prefRows) allowMap.set(r.userId, r.allowed);
    const filteredIds = afterMatchesPref.filter((id) => allowMap.get(id) !== false);
    if (!filteredIds.length) return [];

    const rows = await db
      .select({ id: users.id, expoPushToken: users.expoPushToken })
      .from(users)
      .where(inArray(users.id, filteredIds));

    const userIdByToken = new Map<string, string>();
    const messages: ExpoPushMessage[] = [];
    const candidateUserIds: string[] = [];

    for (const row of rows) {
      if (row.expoPushToken && isValidExpoPushToken(row.expoPushToken)) {
        userIdByToken.set(row.expoPushToken, row.id);
        candidateUserIds.push(row.id);
        messages.push({
          to: row.expoPushToken,
          title: it["push.plannedRouteInvite.title"] ?? "Sei stato proposto per un giro! 🏍️",
          body: it["push.plannedRouteInvite.body"] ?? "Un percorso compatibile con il tuo stile ti aspetta — apri BikerLink",
          sound: "default" as const,
          data: { type: "planned_route_invite", routeId: opts.routeId },
          channelId: "matches",
        });
      }
    }

    if (messages.length === 0) return [];

    // Helper per registrare l'intero batch come fallito (HTTP non-200 o errore di
    // rete): senza questo lo storico restava vuoto su questi rami → la probe
    // notifiche vedeva 0 righe anche quando un invio era stato tentato.
    const recordAllFailed = async (errorMessage: string) => {
      const failedRows = messages.map((m) => {
        const token = m?.to ?? "";
        return {
          userId: userIdByToken.get(token) ?? null,
          notificationType: "planned_route_invite",
          token,
          status: "failed",
          errorMessage,
        };
      });
      await recordNotificationHistory(failedRows);
    };

    let resp: Response;
    try {
      resp = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(messages),
      });
    } catch (netErr) {
      console.warn("[Push] plannedRouteInvite Expo push network error:", netErr);
      await recordAllFailed(`network error: ${netErr instanceof Error ? netErr.message : String(netErr)}`);
      return [];
    }
    if (!resp.ok) {
      console.warn("[Push] plannedRouteInvite Expo push HTTP error:", resp.status);
      await recordAllFailed(`HTTP ${resp.status}`);
      return [];
    }

    const result = await resp.json() as { data?: Array<{ status: "ok" | "error"; message?: string; details?: { error?: string } }> };
    const tickets = result.data ?? [];
    const sentUserIds: string[] = [];
    const historyRows: Array<{ userId: string | null; notificationType: string; token: string; status: string; errorMessage?: string }> = [];
    for (let i = 0; i < messages.length; i++) {
      const token = messages[i]?.to ?? "";
      const uid = userIdByToken.get(token) ?? null;
      const ticket = tickets[i];
      // Ticket assente = fallito, non riuscito (no over-report degli invii).
      if (!ticket) {
        historyRows.push({ userId: uid, notificationType: "planned_route_invite", token, status: "failed", errorMessage: "ticket mancante nella risposta Expo" });
      } else if (ticket.status === "error") {
        if (ticket.details?.error === "DeviceNotRegistered" && uid) {
          clearStaleToken(uid);
        }
        historyRows.push({ userId: uid, notificationType: "planned_route_invite", token, status: "failed", errorMessage: ticket.details?.error ?? ticket.message ?? "ticket error" });
      } else {
        if (uid) sentUserIds.push(uid);
        historyRows.push({ userId: uid, notificationType: "planned_route_invite", token, status: "sent" });
      }
    }
    await recordNotificationHistory(historyRows);
    return sentUserIds.length > 0 ? sentUserIds : candidateUserIds;
  } catch (err) {
    console.warn("[Push] sendPlannedRouteInvitePushNotifications error (non-fatal):", err);
    return [];
  }
}

export async function sendSosPushNotifications(
  nearbyUserIds: string[],
  opts: { reason: string; requesterNickname: string },
): Promise<void> {
  if (!nearbyUserIds.length) return;
  try {
    const filteredIds = await filterUserIdsByPreference(nearbyUserIds, "system_alerts");
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
          title: "🆘 SOS Biker nelle vicinanze",
          body: opts.reason,
          sound: "default" as const,
          data: { type: "sos", requesterNickname: opts.requesterNickname },
          channelId: "matches",
        });
      }
    }

    if (messages.length === 0) return;
    await sendExpoMessages(messages, userIdByToken);
  } catch (err) {
    console.warn("[Push] sendSosPushNotifications error (non-fatal):", err);
  }
}

export { sendModeratorReportPush, sendGpsRejectionAlertToAdmins, sendSystemAlertPushToAdmins, sendOtaPendingApprovalPushToAdmins, sendAdminGpsAlertPush } from './push-notifications-admin';
