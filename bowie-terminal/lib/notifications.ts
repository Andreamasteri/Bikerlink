import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import Constants from "expo-constants";
import { getToken } from "./session";
import { notificationReply } from "./bowie-client";

// ⚠️ POC (Task #5222, step 6). Il flusso headless text-reply ad app terminata
// NON è collaudato in questo progetto. Se l'OS non risveglia il task con il
// testo della quick-reply, il fallback accettabile è: la notifica apre l'app.

const CHANNEL_ID = "bowie";
const CATEGORY_ID = "bowie_reply";
const ONGOING_ID = "bowie-ongoing";
const BACKGROUND_TASK = "BOWIE_NOTIFICATION_TASK";

// Inoltra il testo della quick-reply all'endpoint non-streaming. La risposta
// dell'AI arriva come nuova push notification (gestita dal server).
async function forwardReply(userText: string | undefined): Promise<void> {
  const text = userText?.trim();
  if (!text) return;
  const token = await getToken();
  if (!token) return;
  try {
    await notificationReply(text, token);
  } catch {
    /* push reply best-effort */
  }
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
      identifier: "REPLY",
      buttonTitle: "Scrivi a Bowie",
      textInput: { submitButtonTitle: "Invia", placeholder: "Chiedi a Bowie..." },
      options: { opensAppToForeground: false },
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
      body: "In ascolto — scrivi senza aprire l'app",
      categoryIdentifier: CATEGORY_ID,
      color: "#FF6600",
      sticky: true,
      autoDismiss: false,
    },
    trigger: null,
  });
}

// Listener foreground/background: quando il processo è vivo, la quick-reply
// arriva qui e viene inoltrata. (Percorso affidabile, non-POC.)
export function addReplyListener(): { remove: () => void } {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    void (async () => {
      await forwardReply(response.userText);
      await showPersistentNotification();
    })();
  });
}

// Task headless: l'OS PUO' risvegliarlo per le risposte quando l'app non è in
// foreground. POC — se il payload non contiene il testo, non fa nulla (fallback
// = la notifica apre l'app).
TaskManager.defineTask(BACKGROUND_TASK, async ({ data, error }) => {
  if (error) return;
  try {
    const payload = data as {
      notification?: { userText?: string };
      response?: { userText?: string };
    } | undefined;
    const userText = payload?.response?.userText ?? payload?.notification?.userText;
    await forwardReply(userText);
  } catch {
    /* headless best-effort */
  }
});

export async function registerBackgroundTask(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    await Notifications.registerTaskAsync(BACKGROUND_TASK);
  } catch {
    /* non tutte le combinazioni SDK/OS supportano la reply headless — fallback documentato */
  }
}
