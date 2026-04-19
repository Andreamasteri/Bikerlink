import type { Response } from "express";

const sseClients = new Map<string, Response>();

export function addSseClient(userId: string, res: Response): void {
  const existing = sseClients.get(userId);
  if (existing) {
    try { existing.end(); } catch {}
  }
  sseClients.set(userId, res);
}

export function removeSseClient(userId: string): void {
  sseClients.delete(userId);
}

export interface ChatSseEvent {
  type: "new_message" | "conversation_update";
  conversationId: string;
  message?: object;
}

export function notifyChatEvent(participantIds: string[], event: ChatSseEvent): void {
  const payload = `event: chat\ndata: ${JSON.stringify(event)}\n\n`;
  for (const uid of participantIds) {
    const client = sseClients.get(uid);
    if (client) {
      try {
        client.write(payload);
      } catch {
        sseClients.delete(uid);
      }
    }
  }
}
