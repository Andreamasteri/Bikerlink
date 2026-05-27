import type { Server as HttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { parse as parseUrl } from "url";

interface AdminClient {
  ws: WebSocket;
  userId: string;
}

const clients = new Set<AdminClient>();
let wss: WebSocketServer | null = null;

/**
 * Attach a websocket server for admin urgent-match alerts.
 * Mounted at `/ws/admin/notifications`. Auth via session cookie validated upstream.
 */
export function attachAdminNotificationsWS(server: HttpServer): void {
  if (wss) return;
  wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", async (req, socket, head) => {
    try {
      const url = req.url ?? "";
      if (!url.startsWith("/ws/admin/notifications")) return;

      // Lazy-load session validator to avoid circular deps
      const { validateSessionForUpgrade } = await import("./ws-auth");
      const userId = await validateSessionForUpgrade(req);
      if (!userId) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      wss!.handleUpgrade(req, socket, head, (ws) => {
        const client: AdminClient = { ws, userId };
        clients.add(client);
        ws.on("close", () => clients.delete(client));
        ws.on("error", () => clients.delete(client));
        try { ws.send(JSON.stringify({ type: "hello", at: new Date().toISOString() })); } catch {/* noop */}
      });
    } catch (err) {
      console.warn("[NotifWS] upgrade error:", err);
      try { socket.destroy(); } catch {/* noop */}
    }
  });

  console.log("[NotifWS] Admin notifications WS attached at /ws/admin/notifications");
}

export function broadcastAdminUrgent(payload: {
  table: string;
  matchId: string;
  userIds: string[];
  distanceKm: number | null;
}): void {
  if (!wss || clients.size === 0) return;
  const msg = JSON.stringify({ type: "urgent_match", at: new Date().toISOString(), ...payload });
  for (const c of clients) {
    try {
      if (c.ws.readyState === WebSocket.OPEN) c.ws.send(msg);
    } catch {/* noop */}
  }
}

export function getAdminWSClientCount(): number {
  return clients.size;
}

// avoid unused import lint
void parseUrl;
