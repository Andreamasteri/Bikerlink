import type { Server as HttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";

interface DiagClient {
  ws: WebSocket;
  userId: string;
  role: string;
}

const clients = new Map<string, DiagClient>(); // userId → client
let wss: WebSocketServer | null = null;

export function attachDiagnosticWS(server: HttpServer): void {
  if (wss) return;
  wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", async (req, socket, head) => {
    try {
      const url = req.url ?? "";
      if (!url.startsWith("/ws/diagnostic")) return;
      const { validateSessionForUpgrade } = await import("./matching/notifications/ws-auth");
      const userId = await validateSessionForUpgrade(req);
      if (!userId) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
      let role = "user";
      try {
        const { storage } = await import("./storage");
        const user = await storage.getUser(userId);
        role = user?.role ?? "user";
      } catch {/* noop */}

      wss!.handleUpgrade(req, socket, head, (ws) => {
        const client: DiagClient = { ws, userId, role };
        clients.set(userId, client);
        broadcastToAdmins({ type: "diag:online-update" });
        ws.on("message", (raw) => {
          try {
            const msg = JSON.parse(raw.toString()) as { type: string; [k: string]: unknown };
            handleClientMessage(client, msg);
          } catch {/* invalid JSON */}
        });
        ws.on("close", () => { clients.delete(userId); broadcastToAdmins({ type: "diag:online-update" }); });
        ws.on("error", () => { clients.delete(userId); broadcastToAdmins({ type: "diag:online-update" }); });
        try { ws.send(JSON.stringify({ type: "diag:hello", at: new Date().toISOString() })); } catch {/* noop */}
        // Deliver any pending queued command immediately on connect
        void deliverQueuedCommand(userId, ws);
      });
    } catch (err) {
      console.warn("[DiagWS] upgrade error:", err);
      try { socket.destroy(); } catch {/* noop */}
    }
  });
  console.log("[DiagWS] Diagnostic WS attached at /ws/diagnostic");
}

async function deliverQueuedCommand(userId: string, ws: WebSocket): Promise<void> {
  try {
    const { db } = await import("./db");
    const { diagnosticQueue } = await import("@shared/db");
    const { and, eq, isNull, gt } = await import("drizzle-orm");
    const now = new Date();
    const pending = await db
      .select()
      .from(diagnosticQueue)
      .where(
        and(
          eq(diagnosticQueue.userId, userId),
          isNull(diagnosticQueue.executedAt),
          gt(diagnosticQueue.expiresAt, now)
        )
      )
      .limit(1);
    if (pending.length === 0) return;
    const cmd = pending[0];
    const payload = JSON.stringify({
      type: "diagnostic:run",
      commandId: cmd.id,
      showBanner: cmd.showBanner,
    });
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
      await db
        .update(diagnosticQueue)
        .set({ executedAt: new Date() })
        .where(eq(diagnosticQueue.id, cmd.id));
    }
  } catch (err) {
    console.warn("[DiagWS] deliverQueuedCommand error:", err);
  }
}

function handleClientMessage(client: DiagClient, msg: { type: string; [k: string]: unknown }): void {
  if (msg.type === "diagnostic:progress") {
    broadcastToAdmins({ type: "diag:progress", userId: client.userId, done: msg.done, total: msg.total, lastResult: msg.lastResult });
  } else if (msg.type === "diagnostic:result") {
    broadcastToAdmins({ type: "diag:result", userId: client.userId, summary: msg.summary });
  }
}

function broadcastToAdmins(payload: Record<string, unknown>): void {
  const data = JSON.stringify({ ...payload, at: new Date().toISOString() });
  for (const c of clients.values()) {
    if (c.role !== "admin") continue;
    try {
      if (c.ws.readyState === WebSocket.OPEN) c.ws.send(data);
    } catch {/* noop */}
  }
}

export function sendDiagnosticCommand(userId: string, showBanner = false): boolean {
  const client = clients.get(userId);
  if (!client || client.ws.readyState !== WebSocket.OPEN) return false;
  try {
    client.ws.send(JSON.stringify({ type: "diagnostic:run", showBanner }));
    return true;
  } catch {
    return false;
  }
}

export function getOnlineUsers(): Array<{ userId: string; role: string }> {
  return Array.from(clients.values()).map(c => ({ userId: c.userId, role: c.role }));
}
