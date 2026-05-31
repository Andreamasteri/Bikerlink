import { storage } from "../storage";

// Best-effort audit log condiviso fra le route admin e moderatore.
// Il log di audit non deve mai causare un 500: se l'insert fallisce (FK
// violation, constraint DB, watchdog con pseudo-userId), l'errore è loggato
// come warning ma la richiesta principale prosegue normalmente.
export async function safeModLog(
  entry: Parameters<typeof storage.createModeratorLog>[0],
): Promise<void> {
  try {
    if (!entry.moderatorId || entry.moderatorId === "__watchdog__") return;
    await storage.createModeratorLog(entry);
  } catch (err) {
    console.warn("[ads/mod-log] insert failed (non-fatal):", err);
  }
}
