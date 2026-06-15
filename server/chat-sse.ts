import type { Response } from "express";

interface SseEntry {
  res: Response;
  connId: string;
}

const MAX_CONNECTIONS_PER_USER = 3;
const sseClients = new Map<string, SseEntry[]>();

export function addSseClient(userId: string, res: Response): string {
  const connId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const existing = sseClients.get(userId) ?? [];

  if (existing.length >= MAX_CONNECTIONS_PER_USER) {
    const oldest = existing.shift()!;
    try { oldest.res.end(); } catch { /* no-op: intentional silent close */ }
  }

  existing.push({ res, connId });
  sseClients.set(userId, existing);
  return connId;
}

export function removeSseClient(userId: string, connId: string): void {
  const entries = sseClients.get(userId);
  if (!entries) return;
  const updated = entries.filter((e) => e.connId !== connId);
  if (updated.length === 0) {
    sseClients.delete(userId);
  } else {
    sseClients.set(userId, updated);
  }
}

export function closeSseClient(userId: string): void {
  const entries = sseClients.get(userId);
  if (entries) {
    for (const entry of entries) {
      try { entry.res.end(); } catch { /* no-op: intentional silent close */ }
    }
    sseClients.delete(userId);
  }
}

export function isUserConnected(userId: string): boolean {
  return sseClients.has(userId);
}

export function filterConnectedUserIds(userIds: string[]): string[] {
  return userIds.filter((uid) => sseClients.has(uid));
}

export interface ChatSseEvent {
  type: "new_message" | "conversation_update" | "message_deleted";
  conversationId: string;
  message?: object;
  messageId?: string;
}

export interface PresenceSseEvent {
  type: "presence";
  conversationId: string;
  onlineUserIds: string[];
}

export function notifyChatEvent(participantIds: string[], event: ChatSseEvent): void {
  const payload = `event: chat\ndata: ${JSON.stringify(event)}\n\n`;
  for (const uid of participantIds) {
    const entries = sseClients.get(uid);
    if (!entries) continue;
    const failed: string[] = [];
    for (const entry of entries) {
      try {
        entry.res.write(payload);
      } catch {
        failed.push(entry.connId);
      }
    }
    if (failed.length > 0) {
      const updated = entries.filter((e) => !failed.includes(e.connId));
      if (updated.length === 0) {
        sseClients.delete(uid);
      } else {
        sseClients.set(uid, updated);
      }
    }
  }
}

export function notifyPresenceEvent(participantIds: string[], conversationId: string, onlineUserIds: string[]): void {
  const event: PresenceSseEvent = { type: "presence", conversationId, onlineUserIds };
  const payload = `event: presence\ndata: ${JSON.stringify(event)}\n\n`;
  for (const uid of participantIds) {
    const entries = sseClients.get(uid);
    if (!entries) continue;
    const failed: string[] = [];
    for (const entry of entries) {
      try {
        entry.res.write(payload);
      } catch {
        failed.push(entry.connId);
      }
    }
    if (failed.length > 0) {
      const updated = entries.filter((e) => !failed.includes(e.connId));
      if (updated.length === 0) {
        sseClients.delete(uid);
      } else {
        sseClients.set(uid, updated);
      }
    }
  }
}
