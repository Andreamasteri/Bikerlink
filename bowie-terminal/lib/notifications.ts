import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";

// Task #5272 — Consegna affidabile della quick-reply dalla notifica persistente.
//
// Il flusso headless "app terminata" (Task #5222 POC) NON era collaudabile: se
// l'OS non risveglia il task con il testo, la reply spariva silenziosamente.
// Non potendo validarlo su device fisico, lo rendiamo affidabile per costruzione:
// l'azione di reply ha `opensAppToForeground: true`, quindi Android APRE SEMPRE
// l'app quando si invia una risposta (anche da app killata). Il testo digitato
// viene recuperato in due modi complementari, senza mai perderlo:
//   - App viva (foreground/background): `addReplyListener` riceve la response.
//   - App killata → riavviata: `consumePendingReply()` legge la response che ha
//     lanciato l'app (getLastNotificationResponse) e la consuma una sola volta.
// In entrambi i casi (Task #5277) il testo passa da POST /notification-reply
// con il deviceId di questo device: il server risponde con una push mirata
// SOLO a lui, intercettata da `addBowieReplyPushListener` qui sotto e mostrata
// nella riga AI in attesa nel terminale.

const CHANNEL_ID = "bowie";
const CATEGORY_ID = "bowie_reply";
const ONGOING_ID = "bowie-ongoing";
const REPLY_ACTION_ID = "REPLY";

// Estrae il testo della quick-reply da una response SOLO se proviene dalla nostra
// azione REPLY della categoria Bowie (ignora tap generici / altre notifiche).
function extractReplyText(
  response: Notifications.NotificationResponse | null,
): string | null {
  if (!response) return null;
  if (response.actionIdentifier !== REPLY_ACTION_ID) return null;
  const category = response.notification.request.content.categoryIdentifier;
  if (category !== CATEGORY_ID) return null;
  const text = response.userText?.trim();
  return text ? text : null;
}

// Crea il canale Android (no-op su iOS), la categoria con input di testo
// (Android + iOS — su iOS diventa una UNTextInputNotificationAction, che è
// l'equivalente nativo e appare anche dalla notifica sulla lock screen) e
// richiede i permessi. Ritorna l'Expo push token (o null se non disponibile).
// Task #5311 — prima solo Android aveva categoria/permessi: su iOS bastava
// registerForRemoteNotifications (via getExpoPushTokenAsync) per la push
// data-only di auto-chiusura (Task #5309). Ora anche iOS chiede il permesso
// "alert" e registra la stessa categoria REPLY, perché senza permesso
// notifiche visibili l'azione di quick-reply non comparirebbe mai in UI.
export async function setupNotifications(): Promise<string | null> {
  if (Platform.OS !== "android" && Platform.OS !== "ios") return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Bowie Terminal",
      importance: Notifications.AndroidImportance.LOW,
      showBadge: false,
    });
  }

  await Notifications.setNotificationCategoryAsync(CATEGORY_ID, [
    {
      identifier: REPLY_ACTION_ID,
      buttonTitle: "Scrivi a Bowie",
      textInput: { submitButtonTitle: "Invia", placeholder: "Chiedi a Bowie..." },
      // Task #5272 — true: l'app si apre sempre all'invio della reply, così il
      // testo raggiunge la JS in modo garantito (nessun input perso ad app killata).
      // Su iOS opensAppToForeground è l'equivalente di foreground:true.
      options: { opensAppToForeground: true },
    },
  ]);

  const perm = await Notifications.requestPermissionsAsync();
  if (!perm.granted) return null;

  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
    const res = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    return res.data;
  } catch {
    return null;
  }
}

// Notifica ongoing "in ascolto" con la quick-reply inline.
// Task #5311 — abilitata anche su iOS: `sticky`/`autoDismiss` sono ignorati
// dall'OS (iOS non ha l'equivalente della notifica persistente da foreground
// service Android), ma la notifica compare comunque su lock screen/Notification
// Center con l'azione REPLY della categoria, che è ciò che serve alla quick-reply.
export async function showPersistentNotification(): Promise<void> {
  if (Platform.OS !== "android" && Platform.OS !== "ios") return;
  await Notifications.scheduleNotificationAsync({
    identifier: ONGOING_ID,
    content: {
      title: "Bowie Terminal",
      body: "In ascolto — scrivi e apri per parlare con Bowie",
      categoryIdentifier: CATEGORY_ID,
      color: "#FF6600",
      sticky: true,
      autoDismiss: false,
    },
    trigger: null,
  });
}

// Listener attivo quando il processo è vivo (foreground/background): la response
// della quick-reply arriva qui. Passa il testo al chiamante (il terminale lo
// inoltra a /notification-reply, la risposta di Bowie torna come push) e
// ripristina la notifica persistente.
export function addReplyListener(onReply: (text: string) => void): {
  remove: () => void;
} {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const text = extractReplyText(response);
    if (!text) return;
    onReply(text);
    void showPersistentNotification();
  });
}

// Task #5277 (gap fix) — riceve la push di risposta di Bowie generata da
// sendBowieReplyPush() per la quick-reply inviata via notification-reply.
// data.type === "bowie_reply" distingue questa push da qualunque altra.
export interface BowieReplyPush {
  persona: string;
  text: string;
}

function extractBowieReplyPush(
  notification: Notifications.Notification | null,
): BowieReplyPush | null {
  if (!notification) return null;
  const data = notification.request.content.data as { type?: string; persona?: string } | undefined;
  if (data?.type !== "bowie_reply") return null;
  const text = notification.request.content.body?.trim();
  if (!text) return null;
  return { persona: data.persona ?? "bowie", text };
}

export function addBowieReplyPushListener(onPush: (reply: BowieReplyPush) => void): {
  remove: () => void;
} {
  return Notifications.addNotificationReceivedListener((notification) => {
    const reply = extractBowieReplyPush(notification);
    if (reply) onPush(reply);
  });
}

// Task #5304 — segnale push data-only inviato dal server quando l'app
// principale BikerLink va in foreground. Rende l'auto-chiusura del terminale
// quasi istantanea invece di attendere il prossimo poll (fino a 50s).
function isMainAppForegroundClosePush(
  notification: Notifications.Notification | null,
): boolean {
  if (!notification) return false;
  const data = notification.request.content.data as { type?: string } | undefined;
  return data?.type === "main_app_foreground_close";
}

export function addMainAppForegroundClosePushListener(onSignal: () => void): {
  remove: () => void;
} {
  return Notifications.addNotificationReceivedListener((notification) => {
    if (isMainAppForegroundClosePush(notification)) onSignal();
  });
}

// Recupero cold-start: legge la response che ha lanciato l'app (da killata) e la
// consuma UNA sola volta (clear), evitando di re-inviarla a ogni apertura futura.
// Ritorna il testo della quick-reply, o null se l'app non è stata aperta da una
// reply. Sincrono lato native ma esposto async per comodità del chiamante.
// Task #5311 — abilitato anche su iOS: getLastNotificationResponse/
// clearLastNotificationResponse sono API cross-platform, ma il cold-start su
// iOS si comporta diversamente da Android (l'OS può richiedere più tempo a
// consegnare la response che ha lanciato l'app) — va verificato su device reale.
export async function consumePendingReply(): Promise<string | null> {
  if (Platform.OS !== "android" && Platform.OS !== "ios") return null;
  try {
    const response = Notifications.getLastNotificationResponse();
    const text = extractReplyText(response);
    if (!text) return null;
    // Consuma la response così non viene riprocessata alle aperture successive.
    Notifications.clearLastNotificationResponse();
    return text;
  } catch {
    return null;
  }
}
