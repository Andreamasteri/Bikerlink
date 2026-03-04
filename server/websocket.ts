import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";

interface WSClient {
  ws: WebSocket;
  userId: string;
}

const clients: Map<string, WSClient[]> = new Map();

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws, req) => {
    let userId: string | null = null;

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === "auth") {
          userId = msg.userId;
          if (userId) {
            const existing = clients.get(userId) || [];
            existing.push({ ws, userId });
            clients.set(userId, existing);
          }
        }

        if (msg.type === "typing" && msg.conversationId) {
          broadcastToConversation(msg.conversationId, {
            type: "user_typing",
            userId: userId,
            conversationId: msg.conversationId,
          }, userId);
        }
      } catch (e) {}
    });

    ws.on("close", () => {
      if (userId) {
        const existing = clients.get(userId) || [];
        const filtered = existing.filter(c => c.ws !== ws);
        if (filtered.length === 0) {
          clients.delete(userId);
        } else {
          clients.set(userId, filtered);
        }
      }
    });
  });

  return wss;
}

export function sendToUser(userId: string, data: any) {
  const userClients = clients.get(userId);
  if (!userClients) return;

  const message = JSON.stringify(data);
  for (const client of userClients) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(message);
    }
  }
}

function broadcastToConversation(conversationId: string, data: any, excludeUserId: string | null) {
  const message = JSON.stringify(data);
  for (const [uid, userClients] of clients.entries()) {
    if (uid === excludeUserId) continue;
    for (const client of userClients) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
      }
    }
  }
}

export function notifyNewMessage(conversationParticipantIds: string[], senderId: string, messageData: any) {
  for (const participantId of conversationParticipantIds) {
    if (participantId === senderId) continue;
    sendToUser(participantId, {
      type: "new_message",
      ...messageData,
    });
  }
}
