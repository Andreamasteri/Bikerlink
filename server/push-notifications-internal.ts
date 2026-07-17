// Tipi e helper interni condivisi tra push-notifications.ts e push-notifications-admin.ts.
// Non importare direttamente dall'esterno — usare push-notifications.ts come entry point.
import { db } from "./db";
import { users, userProfiles, pushTokens, bowieTerminalTokens } from "@shared/db";
import { inArray, eq, and, isNull, sql } from "drizzle-orm";

export type NotificationPrefKey = "matches" | "zoneProposals" | "chat" | "motoclub" | "eventi" | "system_alerts";

export interface ExpoPushMessage {
  to: string;
  // Task #5304 — opzionali per i segnali data-only (es. auto-chiusura Bowie
  // Terminal): senza title/body Android non mostra alcun banner visibile.
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
  channelId?: string;
  // Task #5309 — richiesti da APNs per consegnare una push "silenziosa" (nessun
  // banner) a un device iOS anche in background/killed: senza _contentAvailable
  // il sistema APNs scarta il payload data-only invece di risvegliare l'app.
  // priority "normal" evita l'alert implicito che high-priority forzerebbe.
  priority?: "default" | "normal" | "high";
  _contentAvailable?: boolean;
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

// Task #5273: rimuove UNA riga stantia dalla tabella per-app push_tokens usando
// il token come chiave (DeviceNotRegistered). Usato dai sender che leggono dalla
// tabella per-app (es. bowie) invece che da users.expoPushToken, così pulire un
// token di un'app NON azzera lo slot legacy dell'app principale.
export async function clearStalePushTokenRow(token: string): Promise<void> {
  try {
    await db.delete(pushTokens).where(eq(pushTokens.token, token));
    console.warn(`[Push] Cleared stale push_tokens row (DeviceNotRegistered)`);
  } catch (err) {
    console.warn("[Push] Failed to clear stale push_tokens row (non-fatal):", err);
  }
}

// Task #5273: token validi di una specifica app (es. "bowie") per un insieme di
// utenti, letti dalla tabella per-app push_tokens. Ritorna la mappa token→userId
// pronta per sendExpoMessages.
export async function getAppPushTokens(
  userIds: string[],
  appId: string,
): Promise<Array<{ userId: string; token: string }>> {
  if (!userIds.length) return [];
  try {
    const rows = await db
      .select({ userId: pushTokens.userId, token: pushTokens.token })
      .from(pushTokens)
      .where(and(inArray(pushTokens.userId, userIds), eq(pushTokens.appId, appId)));
    return rows.filter((r) => isValidExpoPushToken(r.token));
  } catch (err) {
    console.warn("[Push] getAppPushTokens failed (non-fatal):", err);
    return [];
  }
}

// Task #5277: token del device specifico che ha originato una notification-reply
// (registro per-dispositivo bowie_terminal_tokens), per non fare broadcast a
// TUTTI i device Bowie dell'utente quando sappiamo esattamente quale ha
// chiesto la risposta. Un device revocato (revoked_at valorizzato) non viene
// mai restituito, quindi non riceve mai la consegna.
export async function getBowieDeviceToken(
  userId: string,
  deviceId: string,
): Promise<string | null> {
  try {
    const [row] = await db
      .select({ pushToken: bowieTerminalTokens.pushToken })
      .from(bowieTerminalTokens)
      .where(
        and(
          eq(bowieTerminalTokens.userId, userId),
          eq(bowieTerminalTokens.deviceId, deviceId),
          isNull(bowieTerminalTokens.revokedAt),
        ),
      )
      .limit(1);
    if (!row || !isValidExpoPushToken(row.pushToken)) return null;
    return row.pushToken;
  } catch (err) {
    console.warn("[Push] getBowieDeviceToken failed (non-fatal):", err);
    return null;
  }
}

// Task #5277: rimuove la riga bowie_terminal_tokens stantia (DeviceNotRegistered)
// individuata per push_token, così un device disinstallato non resta nel
// registro come "attivo" pronto a ricevere altre consegne.
export async function clearStaleBowieDeviceToken(token: string): Promise<void> {
  try {
    await db.delete(bowieTerminalTokens).where(eq(bowieTerminalTokens.pushToken, token));
    console.warn(`[Push] Cleared stale bowie_terminal_tokens row (DeviceNotRegistered)`);
  } catch (err) {
    console.warn("[Push] Failed to clear stale bowie_terminal_tokens row (non-fatal):", err);
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
  opts?: {
    // Task #5273: gestore custom per DeviceNotRegistered. Di default azzera
    // users.expoPushToken (comportamento storico dell'app principale). I sender
    // che leggono dalla tabella per-app (es. bowie) passano un handler che
    // cancella la riga push_tokens per token, senza toccare lo slot legacy.
    onDeviceNotRegistered?: (token: string, userId: string | undefined) => void;
  },
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
          if (opts?.onDeviceNotRegistered) {
            opts.onDeviceNotRegistered(msg.to, userId);
          } else if (userId) {
            clearStaleToken(userId);
          }
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

// Conta i token push validi degli admin (sia da push_tokens app_id="main" che
// dal campo legacy users.expoPushToken). Usato dal guard anti-spam del watchdog
// per rilevare la transizione 0→N token (ripristino dopo periodo a vuoto).
// Non lancia mai: restituisce -1 in caso di errore così il guard non si attiva.
export async function getAdminPushTokenCount(): Promise<number> {
  try {
    const adminRows = await db
      .select({ id: users.id, expoPushToken: users.expoPushToken })
      .from(users)
      .where(eq(users.role, "admin"));

    const adminIds = adminRows.map((r) => r.id);
    if (adminIds.length === 0) return 0;

    const seenTokens = new Set<string>();

    // push_tokens (app_id="main")
    const appRows = await db
      .select({ token: pushTokens.token })
      .from(pushTokens)
      .where(and(inArray(pushTokens.userId, adminIds), eq(pushTokens.appId, "main")));
    for (const r of appRows) {
      if (isValidExpoPushToken(r.token)) seenTokens.add(r.token);
    }

    // Legacy users.expoPushToken
    for (const r of adminRows) {
      if (r.expoPushToken && isValidExpoPushToken(r.expoPushToken)) {
        seenTokens.add(r.expoPushToken);
      }
    }

    return seenTokens.size;
  } catch {
    return -1;
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
