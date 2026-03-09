import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import type { IncomingMessage } from "node:http";
import cookie from "cookie";
import { pool } from "./db";

const clients = new Map<string, Set<WebSocket>>();

let wss: WebSocketServer | null = null;

export function setupWebSocket(httpServer: Server, sessionSecret: string) {
  wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
    const userId = await authenticateWs(req);
    if (!userId) {
      ws.close(4001, "Unauthorized");
      return;
    }

    if (!clients.has(userId)) {
      clients.set(userId, new Set());
    }
    clients.get(userId)!.add(ws);

    ws.send(JSON.stringify({ event: "connected", data: { userId } }));

    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 30000);

    ws.on("pong", () => {});

    ws.on("close", () => {
      clearInterval(pingInterval);
      const userSockets = clients.get(userId);
      if (userSockets) {
        userSockets.delete(ws);
        if (userSockets.size === 0) {
          clients.delete(userId);
        }
      }
    });

    ws.on("error", () => {
      clearInterval(pingInterval);
      const userSockets = clients.get(userId);
      if (userSockets) {
        userSockets.delete(ws);
        if (userSockets.size === 0) {
          clients.delete(userId);
        }
      }
    });
  });

  return wss;
}

async function authenticateWs(req: IncomingMessage): Promise<string | null> {
  try {
    const cookies = cookie.parse(req.headers.cookie || "");
    const sid = cookies["connect.sid"];
    if (!sid) return null;

    const sessionId = decodeURIComponent(sid).split(".")[0].replace("s:", "");

    const result = await pool.query(
      'SELECT sess FROM "session" WHERE sid = $1 AND expire > NOW()',
      [sessionId]
    );

    if (result.rows.length === 0) return null;

    const sess = typeof result.rows[0].sess === "string"
      ? JSON.parse(result.rows[0].sess)
      : result.rows[0].sess;

    return sess.userId || null;
  } catch {
    return null;
  }
}

export function broadcastToUser(userId: string, event: string, data: any) {
  const userSockets = clients.get(userId);
  if (!userSockets) return;

  const message = JSON.stringify({ event, data });
  for (const ws of userSockets) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
}

export function broadcastToUsers(userIds: string[], event: string, data: any) {
  const message = JSON.stringify({ event, data });
  for (const userId of userIds) {
    const userSockets = clients.get(userId);
    if (!userSockets) continue;
    for (const ws of userSockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  }
}

export function broadcastToAll(event: string, data: any) {
  const message = JSON.stringify({ event, data });
  for (const [, userSockets] of clients) {
    for (const ws of userSockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  }
}

export function getConnectedUserCount(): number {
  return clients.size;
}

export function isUserConnected(userId: string): boolean {
  const sockets = clients.get(userId);
  return !!sockets && sockets.size > 0;
}
