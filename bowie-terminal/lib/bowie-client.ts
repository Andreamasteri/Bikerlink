import { fetch as expoFetch } from "expo/fetch";
import { Platform } from "react-native";
import type { PersonaId } from "../constants/theme";

// Dominio del backend BikerLink. Iniettato a build-time via EAS (EXPO_PUBLIC_DOMAIN).
const DOMAIN = process.env.EXPO_PUBLIC_DOMAIN || "bikerlink.replit.app";

export function getApiUrl(): string {
  return `https://${DOMAIN}`;
}

// Lanciato quando il backend risponde 401/403: la sessione va invalidata e
// l'utente rimandato al login (gestito dalla UI con "SESSION EXPIRED").
export class SessionExpiredError extends Error {
  constructor() {
    super("SESSION_EXPIRED");
    this.name = "SessionExpiredError";
  }
}

export interface LoginResult {
  token: string;
  role: string;
  nickname: string;
}

export async function login(identifier: string, password: string): Promise<LoginResult> {
  const res = await expoFetch(new URL("/api/auth/login", getApiUrl()).toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password, platform: "android" }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    sessionToken?: string;
    role?: string;
    nickname?: string;
    error?: string;
    message?: string;
  };
  if (!res.ok) {
    throw new Error(json.error ?? json.message ?? "Credenziali non valide");
  }
  if (!json.sessionToken) {
    throw new Error("Token non ricevuto dal server");
  }
  return { token: json.sessionToken, role: json.role ?? "user", nickname: json.nickname ?? "" };
}

// Il server invia la persona come stringa (AiPersonaId: "bowie"|"horus"|"ares"),
// non come oggetto.
export type StreamPersona = PersonaId;

export interface DoneData {
  text: string;
  persona?: PersonaId;
  securityBlocked?: boolean;
  degraded?: boolean;
}

export interface StreamCallbacks {
  onPersona?: (p: PersonaId) => void;
  onDelta?: (text: string) => void;
  onDone?: (d: DoneData) => void;
  onError?: (e: { code: number; message: string }) => void;
}

export interface SendOptions {
  history?: { role: "user" | "assistant"; content: string }[];
  signal?: AbortSignal;
  // Task #5327 — URL (relativi) delle immagini allegate, ottenuti da uploadImage().
  imageUrls?: string[];
}

// Task #5327 — Carica un'immagine locale (uri del picker) sul backend e
// restituisce l'URL relativo servibile ("/api/ai/assistant/images/<file>").
// Usa la fetch nativa di RN (gestisce il multipart con { uri, name, type });
// expo/fetch è riservata allo streaming SSE.
export async function uploadImage(uri: string, token: string): Promise<string> {
  const name = uri.split("/").pop() || `image_${Date.now()}.jpg`;
  const ext = (/\.(\w+)$/.exec(name)?.[1] || "jpg").toLowerCase();
  const mime =
    ext === "png" ? "image/png"
    : ext === "webp" ? "image/webp"
    : ext === "gif" ? "image/gif"
    : ext === "heic" ? "image/heic"
    : "image/jpeg";
  const form = new FormData();
  form.append("image", { uri, name, type: mime } as unknown as Blob);
  const res = await fetch(new URL("/api/ai/assistant/images", getApiUrl()).toString(), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (res.status === 401 || res.status === 403) throw new SessionExpiredError();
  if (!res.ok) throw new Error(`Upload immagine fallito (${res.status})`);
  const json = (await res.json().catch(() => ({}))) as { url?: string };
  if (!json.url) throw new Error("URL immagine non ricevuto dal server");
  return json.url;
}

// Stream SSE della risposta dell'agente. Legge il body chunk per chunk, separa
// gli eventi su "\n\n" e instrada per tipo (persona/delta/done/error).
export async function sendMessage(
  message: string,
  token: string,
  cbs: StreamCallbacks,
  opts?: SendOptions,
): Promise<void> {
  const res = await expoFetch(new URL("/api/ai/assistant/message", getApiUrl()).toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      message,
      platform: "android",
      history: opts?.history ?? [],
      // Task #5228 — attribuzione al client standalone nel monitor admin.
      source: "bowie_terminal",
      // Task #5327 — immagini allegate (URL relativi risolti server-side).
      ...(opts?.imageUrls && opts.imageUrls.length > 0 ? { imageUrls: opts.imageUrls } : {}),
    }),
    signal: opts?.signal,
  });

  if (res.status === 401 || res.status === 403) throw new SessionExpiredError();
  if (!res.ok || !res.body) {
    cbs.onError?.({ code: res.status, message: `Errore server (${res.status})` });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx = buffer.indexOf("\n\n");
    while (idx !== -1) {
      const rawEvent = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      dispatchSseEvent(rawEvent, cbs);
      idx = buffer.indexOf("\n\n");
    }
  }
}

function dispatchSseEvent(raw: string, cbs: StreamCallbacks): void {
  let event = "message";
  let dataStr = "";
  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
  }
  if (!dataStr) return;
  let data: unknown;
  try {
    data = JSON.parse(dataStr);
  } catch {
    return;
  }
  switch (event) {
    case "persona":
      cbs.onPersona?.(data as PersonaId);
      break;
    case "delta":
      cbs.onDelta?.((data as { text: string }).text);
      break;
    case "done":
      cbs.onDone?.(data as DoneData);
      break;
    case "error":
      cbs.onError?.(data as { code: number; message: string });
      break;
    default:
      // "action" e altri eventi non sono usati dal terminale.
      break;
  }
}

// Registra l'Expo push token del dispositivo sull'account (per la quick-reply
// della notifica persistente). Best-effort: un fallimento non blocca la UI.
export async function registerPushToken(expoPushToken: string, token: string): Promise<void> {
  try {
    await expoFetch(new URL("/api/users/me/push-token", getApiUrl()).toString(), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      // Task #5273: appId="bowie" così il server salva questo token nella
      // tabella per-app push_tokens senza toccare users.expoPushToken (che
      // appartiene all'app principale). Fine del furto di notifiche.
      // Task #5309: platform dinamica (era hardcoded "android") ora che anche
      // iOS registra un push token per il segnale di auto-chiusura.
      body: JSON.stringify({ token: expoPushToken, appId: "bowie", platform: Platform.OS }),
    });
  } catch {
    /* best-effort */
  }
}

// Task #5228 — Registra il token push nel registro per-dispositivo del terminale
// standalone (bowie_terminal_tokens), separato da users.expoPushToken. Permette
// al monitor admin di elencare/revocare i singoli device. Best-effort.
export async function registerBowieTerminalToken(
  deviceId: string,
  expoPushToken: string,
  token: string,
): Promise<void> {
  try {
    await expoFetch(new URL("/api/users/me/bowie-terminal-token", getApiUrl()).toString(), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ deviceId, token: expoPushToken }),
    });
  } catch {
    /* best-effort */
  }
}

// Task #5298 — legge il segnale "app principale in foreground" per l'account.
// Restituisce il timestamp ISO dell'ultima apertura dell'app principale, o null
// se non è mai stata aperta. Usato dal poll periodico del terminale per
// l'auto-chiusura (vedi lib/main-app-watch.ts).
export async function getMainAppForeground(token: string): Promise<string | null> {
  const res = await expoFetch(new URL("/api/users/me/main-app-foreground", getApiUrl()).toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 || res.status === 403) throw new SessionExpiredError();
  if (!res.ok) throw new Error(`Errore server (${res.status})`);
  const json = (await res.json().catch(() => ({}))) as { lastMainAppForegroundAt?: string | null };
  return json.lastMainAppForegroundAt ?? null;
}

// Invio non-streaming usato dalla quick-reply: il server elabora e rispedisce
// la risposta come push notification.
// Task #5277 — passa il deviceId così il server consegna la risposta SOLO a
// questo dispositivo (bowie_terminal_tokens) invece di fare broadcast su
// tutti i device Bowie Terminal registrati per l'account.
export async function notificationReply(message: string, token: string, deviceId?: string): Promise<void> {
  const res = await expoFetch(new URL("/api/ai/assistant/notification-reply", getApiUrl()).toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ message, platform: "android", source: "bowie_terminal", deviceId }),
  });
  if (res.status === 401 || res.status === 403) throw new SessionExpiredError();
}
