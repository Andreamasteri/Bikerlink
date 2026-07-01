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
// In entrambi i casi il testo viene reimmesso nel terminale e inviato inline,
// così l'utente vede la risposta nella chat invece che come push separata.

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

// Crea il canale Android, la categoria con input di testo e richiede i permessi.
// Ritorna l'Expo push token (o null se non disponibile / non Android).
export async function setupNotifications(): Promise<string | null> {
  if (Platform.OS !== "android") return null;

  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Bowie Terminal",
    importance: Notifications.AndroidImportance.LOW,
    showBadge: false,
  });

  await Notifications.setNotificationCategoryAsync(CATEGORY_ID, [
    {
      identifier: REPLY_ACTION_ID,
      buttonTitle: "Scrivi a Bowie",
      textInput: { submitButtonTitle: "Invia", placeholder: "Chiedi a Bowie..." },
      // Task #5272 — true: l'app si apre sempre all'invio della reply, così il
      // testo raggiunge la JS in modo garantito (nessun input perso ad app killata).
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
export async function showPersistentNotification(): Promise<void> {
  if (Platform.OS !== "android") return;
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
// invia inline) e ripristina la notifica persistente.
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

// Recupero cold-start: legge la response che ha lanciato l'app (da killata) e la
// consuma UNA sola volta (clear), evitando di re-inviarla a ogni apertura futura.
// Ritorna il testo della quick-reply, o null se l'app non è stata aperta da una
// reply. Sincrono lato native ma esposto async per comodità del chiamante.
export async function consumePendingReply(): Promise<string | null> {
  if (Platform.OS !== "android") return null;
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
