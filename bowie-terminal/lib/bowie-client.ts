import { fetch as expoFetch } from "expo/fetch";
import type { PersonaId } from "../constants/theme";

// Dominio del backend BikerLink. Iniettato a build-time via EAS (EXPO_PUBLIC_DOMAIN).
const DOMAIN = process.env.EXPO_PUBLIC_DOMAIN || "biker-link.replit.app";

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
    body: JSON.stringify({ message, platform: "android", history: opts?.history ?? [] }),
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
      body: JSON.stringify({ token: expoPushToken }),
    });
  } catch {
    /* best-effort */
  }
}

