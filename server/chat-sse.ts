import type { Response } from "express";

interface SseEntry {
  res: Response;
  connId: string;
}

const sseClients = new Map<string, SseEntry>();

export function addSseClient(userId: string, res: Response): string {
  const connId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const existing = sseClients.get(userId);
  if (existing) {
    try { existing.res.end(); } catch {}
  }
  sseClients.set(userId, { res, connId });
  return connId;
}

export function removeSseClient(userId: string, connId: string): void {
  const entry = sseClients.get(userId);
  if (entry && entry.connId === connId) {
    sseClients.delete(userId);
  }
}

export interface ChatSseEvent {
  type: "new_message" | "conversation_update";
  conversationId: string;
  message?: object;
}

export function notifyChatEvent(participantIds: string[], event: ChatSseEvent): void {
  const payload = `event: chat\ndata: ${JSON.stringify(event)}\n\n`;
  for (const uid of participantIds) {
    const entry = sseClients.get(uid);
    if (entry) {
      try {
        entry.res.write(payload);
      } catch {
        sseClients.delete(uid);
      }
    }
  }
}
