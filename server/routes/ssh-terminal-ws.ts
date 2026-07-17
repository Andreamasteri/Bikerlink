// =============================================================================
// WebSocket PTY — /api/ssh/terminal
//
// Apre una sessione SSH interattiva (PTY) al ThinkCentre via il bridge
// Cloudflare Access esistente. Usato dall'app TC Terminal (standalone APK).
//
// AUTH: token admin estratto da query string (?token=<sessionToken>).
//   Il sessionToken è nel formato s:<sid>.<hmac> (cookie-signature).
//   Il server decodifica il sid, lo cerca nella session table e verifica
//   che l'account sia admin+active. Non si usa cookie session perché i
//   WebSocket RN non supportano header custom sull'handshake.
//
// WS MESSAGE TYPES:
//   Client → Server: string (input terminale grezzo) oppure
//                    JSON string { type:"resize", cols:N, rows:M }
//   Server → Client: string (output PTY)
//
// ARCHITETTURA: WebSocketServer con noServer:true + server.on('upgrade')
//   filtrato per pathname. Non usa express-ws (ha bug con alcuni middleware).
//
// RECONNECT RESILIENCE (Task #506)
//   Se conn.on("error") riceve ECONNREFUSED sul localPort (TC riavviato o
//   tunnel CF caduto mentre il bridge era segnato "running"), la route chiama
//   forceBridgeReset() + ensureTcSshBridge() e ritenta una volta la connessione
//   SSH prima di chiudere il WS con errore. Il tutto avviene entro 30s (8s
//   bridge wait + 15s SSH readyTimeout + overhead).
// =============================================================================

import { WebSocketServer, WebSocket } from "ws";
import type { Server, IncomingMessage } from "http";
import { Client as SshClient } from "ssh2";
// @ts-ignore
import signature from "cookie-signature";
import { pool } from "../db";
import { storage } from "../storage";
import { normalizeOpenSshPrivateKey, verifyTcToken } from "./ssh-exec";
import {
  ensureTcSshBridge,
  forceBridgeReset,
} from "../lib/tc-ssh-bridge";

const WS_PATH = "/api/ssh/terminal";

// ── Session token validation ──────────────────────────────────────────────────
// Il sessionToken è s:<sid>.<hmac> (cookie-signature, stesso formato di
// buildSessionToken nei route auth). Verifichiamo il MAC con SESSION_SECRET
// PRIMA di qualsiasi lookup DB: così un sid grezzo senza firma valida non
// bypassa l'autenticazione.

async function validateAdminToken(
  rawToken: string,
): Promise<{ userId: string; tcUsername?: string } | null> {
  try {
    if (!rawToken) return null;

    // ── Token TC-native (generato da POST /api/ssh/terminal/auth) ────────────
    // Formato: "tc:<base64url(payload)>.<hmac>"
    // Non richiede sessione BikerLink né ruolo admin: la verifica è avvenuta
    // al momento del login (password SSH Linux del TC).
    // tcUsername viene propagato al chiamante che lo confronta con TC_SSH_USER
    // prima di aprire il PTY: identità provata al login = identità SSH runtime.
    if (rawToken.startsWith("tc:")) {
      const tcAuth = verifyTcToken(rawToken);
      if (!tcAuth) return null;
      return { userId: `tc:${tcAuth.tcUsername}`, tcUsername: tcAuth.tcUsername };
    }

    // ── Token sessione BikerLink (legacy / accesso dal browser web admin) ────
    const secret = process.env.SESSION_SECRET;
    if (!secret) {
      console.error("[ssh-terminal-ws] SESSION_SECRET non configurato");
      return null;
    }

    const decoded = decodeURIComponent(rawToken);
    const withoutPrefix = decoded.startsWith("s:") ? decoded.slice(2) : decoded;

    // Verifica HMAC: signature.unsign() restituisce il sid originale se la
    // firma è valida, oppure false se il MAC non corrisponde o il token è
    // malformato. Questo impedisce l'uso di sid raw senza firma.
    const sid = signature.unsign(withoutPrefix, secret) as string | false;
    if (!sid) return null; // firma non valida

    const result = await pool.query<{ sess: { userId?: string } }>(
      "SELECT sess FROM session WHERE sid = $1 LIMIT 1",
      [sid],
    );
    const sess = result.rows[0]?.sess;
    const userId = typeof sess?.userId === "string" ? sess.userId : null;
    if (!userId) return null;

    const user = await storage.getUser(userId);
    if (!user || user.role !== "admin" || user.status !== "active") return null;

    return { userId };
  } catch {
    return null;
  }
}

// ── SSH PTY session ───────────────────────────────────────────────────────────

/**
 * Tenta una singola connessione SSH + apertura shell PTY.
 * Risolve con true se la shell è stata aperta con successo, false altrimenti.
 * Risolve con "econnrefused" (string literal) se il bridge locale rifiuta la
 * connessione, così il chiamante può distinguerla da altri errori SSH.
 */
function trySshConnect(
  ws: WebSocket,
  localPort: number,
  username: string,
  privateKey: string,
): Promise<true | "econnrefused" | false> {
  return new Promise((resolve) => {
    const conn = new SshClient();
    let settled = false;

    const finish = (result: true | "econnrefused" | false) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const cleanup = () => {
      try { conn.end(); } catch { /* ignore */ }
    };

    ws.on("close", cleanup);
    ws.on("error", cleanup);

    conn.on("error", (err) => {
      const code = (err as NodeJS.ErrnoException).code;
      console.warn(`[ssh-terminal-ws] SSH error: ${err.message}`);
      if (code === "ECONNREFUSED") {
        finish("econnrefused");
      } else {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(`\r\n! SSH error: ${err.message}\r\n`);
          ws.close(1011, "SSH error");
        }
        finish(false);
      }
      cleanup();
    });

    conn.on("ready", () => {
      conn.shell(
        { term: "xterm-256color", cols: 80, rows: 24 },
        (err, stream) => {
          if (err) {
            console.warn(`[ssh-terminal-ws] shell error: ${err.message}`);
            ws.close(1011, "SSH shell error");
            conn.end();
            finish(false);
            return;
          }

          finish(true);

          // Client → PTY: input + resize.
          ws.on("message", (data) => {
            if (ws.readyState !== WebSocket.OPEN) return;
            const text = typeof data === "string" ? data : data.toString();
            // Tenta parse JSON per i messaggi di controllo (resize).
            if (text.startsWith("{")) {
              try {
                const msg = JSON.parse(text) as {
                  type?: string;
                  cols?: number;
                  rows?: number;
                };
                if (
                  msg.type === "resize" &&
                  typeof msg.cols === "number" &&
                  typeof msg.rows === "number" &&
                  msg.cols > 0 &&
                  msg.rows > 0
                ) {
                  stream.setWindow(msg.rows, msg.cols, 0, 0);
                  return;
                }
              } catch {
                // Non JSON: trattato come input terminale.
              }
            }
            try {
              stream.write(text);
            } catch {
              /* stream già chiuso */
            }
          });

          // PTY → Client: output.
          stream.on("data", (chunk: Buffer) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(chunk.toString());
            }
          });

          stream.on("close", () => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.close(1000, "SSH session ended");
            }
            conn.end();
          });

          stream.stderr?.on("data", (chunk: Buffer) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(chunk.toString());
            }
          });
        },
      );
    });

    conn.connect({
      host: "127.0.0.1",
      port: localPort,
      username,
      privateKey,
      readyTimeout: 15_000,
    });
  });
}

async function openPtySession(ws: WebSocket): Promise<void> {
  const username = process.env.TC_SSH_USER;
  const rawKey = process.env.TC_SSH_KEY;

  if (!username) {
    ws.close(1011, "TC_SSH_USER non configurato");
    return;
  }
  if (!rawKey?.trim()) {
    ws.close(1011, "TC_SSH_KEY non configurato");
    return;
  }

  // Avvia / riusa il bridge Cloudflare Access (lazy).
  const bridge = await ensureTcSshBridge();
  if (!bridge.ok) {
    ws.close(1011, `Bridge CF non disponibile: ${bridge.error ?? "sconosciuto"}`);
    return;
  }

  const privateKey = normalizeOpenSshPrivateKey(rawKey);

  // Prima connessione SSH.
  const result = await trySshConnect(ws, bridge.localPort, username, privateKey);

  if (result === true) return; // sessione aperta con successo

  if (result === "econnrefused") {
    // Il bridge locale rifiuta la connessione anche se era segnato "running":
    // TC riavviato o tunnel CF caduto. Forziamo il reset e riproviamo.
    console.warn(
      `[ssh-terminal-ws] ECONNREFUSED su porta ${bridge.localPort} — ` +
      "bridge stantio rilevato, re-stabilire...",
    );
    forceBridgeReset();

    const bridge2 = await ensureTcSshBridge();
    if (!bridge2.ok) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(`\r\n! Bridge non disponibile dopo reset: ${bridge2.error ?? "sconosciuto"}\r\n`);
        ws.close(1011, "Bridge SSH non disponibile");
      }
      return;
    }

    const result2 = await trySshConnect(ws, bridge2.localPort, username, privateKey);
    if (result2 === "econnrefused") {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send("\r\n! SSH: ECONNREFUSED anche dopo reset bridge\r\n");
        ws.close(1011, "SSH ECONNREFUSED");
      }
    }
    // Se result2 === true → sessione aperta; se false → errore già gestito in trySshConnect.
  }
  // Se result === false → errore già gestito in trySshConnect.
}

// ── WebSocket server setup ────────────────────────────────────────────────────

export function setupSshTerminalWs(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req: IncomingMessage, socket, head) => {
    // Filtra strettamente per pathname: non intercettare altri upgrade WS.
    let pathname: string;
    try {
      pathname = new URL(req.url ?? "/", "ws://localhost").pathname;
    } catch {
      return;
    }
    if (pathname !== WS_PATH) return;

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    void (async () => {
      // Estrai token da query string.
      let token: string | null = null;
      try {
        const url = new URL(req.url ?? "/", "ws://localhost");
        token = url.searchParams.get("token");
      } catch {
        ws.close(1008, "URL non valido");
        return;
      }

      if (!token) {
        ws.close(1008, "Token mancante");
        return;
      }

      // Valida sessione admin o token TC-native.
      const auth = await validateAdminToken(token);
      if (!auth) {
        ws.close(1008, "Non autorizzato");
        return;
      }

      // ── Identity binding per token TC-native ────────────────────────────────
      // Il PTY apre sempre come TC_SSH_USER (chiave privata). Per i token
      // TC-native, il tcUsername provato al login DEVE coincidere con
      // TC_SSH_USER: impedisce che un account Linux diverso (e meno
      // privilegiato) ottenga una sessione con l'identità SSH configurata.
      if (auth.tcUsername !== undefined) {
        const configuredUser = (process.env.TC_SSH_USER ?? "").trim();
        if (!configuredUser) {
          ws.close(1011, "TC_SSH_USER non configurato");
          return;
        }
        if (auth.tcUsername !== configuredUser) {
          console.warn(
            `[ssh-terminal-ws] rifiuto identità: token per "${auth.tcUsername}", ` +
            `TC_SSH_USER="${configuredUser}"`,
          );
          ws.close(1008, "Utente TC non autorizzato");
          return;
        }
      }

      console.log(`[ssh-terminal-ws] connessione accettata per ${auth.userId}`);

      await openPtySession(ws);
    })();
  });

  console.log(`[ssh-terminal-ws] WebSocket PTY registrato su ${WS_PATH}`);
}
