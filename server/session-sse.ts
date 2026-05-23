import type { Response } from "express";

interface SessionSseEntry {
  res: Response;
  connId: string;
}

const sessionSseClients = new Map<string, SessionSseEntry>();

export function addSessionSseClient(userId: string, res: Response): string {
  const connId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const existing = sessionSseClients.get(userId);
  if (existing) {
    try { existing.res.end(); } catch (err) { console.warn("[session-sse] Failed to close displaced connection for userId:", userId, err); }
  }
  sessionSseClients.set(userId, { res, connId });
  return connId;
}

export function removeSessionSseClient(userId: string, connId: string): void {
  const entry = sessionSseClients.get(userId);
  if (entry && entry.connId === connId) {
    sessionSseClients.delete(userId);
  }
}

export function notifySessionDisplaced(userId: string): void {
  const entry = sessionSseClients.get(userId);
  if (!entry) return;
  try {
    entry.res.write(`event: session_displaced\ndata: {}\n\n`);
  } catch (err) { console.warn("[session-sse] Failed to write session_displaced event for userId:", userId, err); }
  try { entry.res.end(); } catch (err) { console.warn("[session-sse] Failed to end response for userId:", userId, err); }
  sessionSseClients.delete(userId);
}
