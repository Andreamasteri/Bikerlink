import { Router, type Request, type Response } from "express";
import { Client as SshClient } from "ssh2";
import { createHmac } from "node:crypto";
import { storage } from "../storage";
import { ensureTcSshBridge } from "../lib/tc-ssh-bridge";
import { getTrustedClientIp } from "../lib/abuse-rate-limit";

/**
 * Ricostruisce una chiave privata OpenSSH il cui contenuto ha i newline
 * "collassati" (il paste nell'UI secret spesso li trasforma in spazi). I marker
 * BEGIN/END contengono spazi legittimi, quindi si isolano via regex e si
 * riavvolge il corpo base64 a 64 colonne. Ritorna la chiave normalizzata, o la
 * stringa originale se non combacia il formato (paramiko/ssh2 proverà comunque).
 */
export function normalizeOpenSshPrivateKey(raw: string): string {
  const s = raw.trim();
  if (s.includes("\n")) return s; // già multi-linea, non toccare
  const m = /-----BEGIN ([A-Z0-9 ]+?)-----(.*?)-----END \1-----/s.exec(s);
  if (!m) return s;
  const label = m[1].trim();
  const body = m[2].replace(/\s+/g, "");
  const wrapped = body.replace(/(.{64})/g, "$1\n").replace(/\n$/, "");
  return `-----BEGIN ${label}-----\n${wrapped}\n-----END ${label}-----\n`;
}

export interface SshLogEntry {
  id: number;
  timestamp: string;
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
}

const MAX_LOG_ENTRIES = 50;
const log: SshLogEntry[] = [];
let logIdCounter = 0;

function addLog(entry: Omit<SshLogEntry, "id">): SshLogEntry {
  const full: SshLogEntry = { id: ++logIdCounter, ...entry };
  log.unshift(full);
  if (log.length > MAX_LOG_ENTRIES) log.length = MAX_LOG_ENTRIES;
  return full;
}

export function getSshLog(): SshLogEntry[] {
  return log;
}

function extractCommand(body: unknown): string | undefined {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (typeof b.command === "string") return b.command;
    const firstKey = Object.keys(b)[0];
    if (firstKey) {
      try {
        const parsed = JSON.parse(firstKey) as unknown;
        if (parsed && typeof parsed === "object" && typeof (parsed as Record<string, unknown>).command === "string") {
          return (parsed as Record<string, unknown>).command as string;
        }
      } catch {
        // not JSON key
      }
    }
  }
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body) as unknown;
      if (parsed && typeof parsed === "object" && typeof (parsed as Record<string, unknown>).command === "string") {
        return (parsed as Record<string, unknown>).command as string;
      }
    } catch {
      // not JSON string
    }
  }
  return undefined;
}

async function execSsh(command: string, timeoutMs = 30_000): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  const username = process.env.TC_SSH_USER;
  const rawKey = process.env.TC_SSH_KEY;

  if (!username) {
    throw new Error("TC_SSH_USER non configurato");
  }
  if (!rawKey || !rawKey.trim()) {
    throw new Error("TC_SSH_KEY deve essere configurato (chiave privata OpenSSH)");
  }

  // Il TC è dietro Cloudflare Tunnel + Access: nessuna connessione diretta sulla
  // porta 22. Apriamo (lazy) il bridge cloudflared e ci colleghiamo al listener
  // locale con la chiave privata. Se il bridge non è disponibile (binario o
  // token mancanti) degradiamo con un errore descrittivo, senza crashare.
  const bridge = await ensureTcSshBridge();
  if (!bridge.ok) {
    throw new Error(`Bridge Cloudflare Access non disponibile: ${bridge.error ?? "sconosciuto"}`);
  }

  const privateKey = normalizeOpenSshPrivateKey(rawKey);

  return new Promise((resolve, reject) => {
    const conn = new SshClient();
    let settled = false;
    let stdout = "";
    let stderr = "";

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        conn.end();
        reject(new Error(`Timeout dopo ${timeoutMs / 1000}s`));
      }
    }, timeoutMs);

    conn.on("ready", () => {
      conn.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timeout);
          settled = true;
          conn.end();
          return reject(err);
        }

        stream.on("close", (code: number | null) => {
          clearTimeout(timeout);
          settled = true;
          conn.end();
          resolve({ stdout, stderr, exitCode: code ?? null });
        });

        stream.on("data", (data: Buffer) => {
          stdout += data.toString();
        });

        stream.stderr.on("data", (data: Buffer) => {
          stderr += data.toString();
        });
      });
    });

    conn.on("error", (err) => {
      clearTimeout(timeout);
      if (!settled) {
        settled = true;
        reject(err);
      }
    });

    const connectOpts: Parameters<SshClient["connect"]>[0] = {
      host: "127.0.0.1",
      port: bridge.localPort,
      username,
      privateKey,
      readyTimeout: timeoutMs,
    };

    conn.connect(connectOpts);
  });
}

const router = Router();

async function requireAdminSession(req: Request, res: Response, next: () => void) {
  const session = req.session as { userId?: string } | undefined;
  if (!session?.userId) {
    return res.status(401).json({ error: "Sessione scaduta. Effettua di nuovo l'accesso." });
  }
  try {
    const user = await storage.getUser(session.userId);
    if (!user) return res.status(403).json({ error: "Account non trovato." });
    if (user.role !== "admin") return res.status(403).json({ error: "Accesso riservato agli amministratori." });
    if (user.status !== "active") return res.status(403).json({ error: "Account non attivo." });
  } catch {
    return res.status(500).json({ error: "Errore autenticazione." });
  }
  next();
}

router.post("/exec", requireAdminSession, async (req: Request, res: Response) => {
  const command = extractCommand(req.body);
  if (!command || !command.trim()) {
    return res.status(400).json({ error: "Campo 'command' obbligatorio" });
  }

  const start = Date.now();
  try {
    const result = await execSsh(command.trim());
    const entry = addLog({
      timestamp: new Date().toISOString(),
      command: command.trim(),
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs: Date.now() - start,
    });
    return res.json({ stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode, id: entry.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    addLog({
      timestamp: new Date().toISOString(),
      command: command.trim(),
      exitCode: null,
      stdout: "",
      stderr: message,
      durationMs: Date.now() - start,
    });
    return res.status(500).json({ error: message });
  }
});

router.get("/log", requireAdminSession, (_req: Request, res: Response) => {
  return res.json(getSshLog());
});

// ── TC-native token helpers ──────────────────────────────────────────────────
// Formato: "tc:<base64url(JSON)>.<hmac-sha256-hex>"
// Il payload contiene { u: tcUsername, exp: epochMs }.
// Firmato con SESSION_SECRET — indipendente dai token sessione BikerLink.

const TC_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 ore

export function signTcToken(tcUsername: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET non configurato");
  const payload = Buffer.from(JSON.stringify({
    u: tcUsername,
    exp: Date.now() + TC_TOKEN_TTL_MS,
  })).toString("base64url");
  const mac = createHmac("sha256", secret).update(payload).digest("hex");
  return `tc:${payload}.${mac}`;
}

export function verifyTcToken(raw: string): { tcUsername: string } | null {
  try {
    if (!raw.startsWith("tc:")) return null;
    const secret = process.env.SESSION_SECRET;
    if (!secret) return null; // fail-closed: nessun token valido senza secret
    const body = raw.slice(3); // rimuovi "tc:"
    const dotIdx = body.lastIndexOf(".");
    if (dotIdx < 0) return null;
    const payload = body.slice(0, dotIdx);
    const mac = body.slice(dotIdx + 1);
    const expected = createHmac("sha256", secret).update(payload).digest("hex");
    // Confronto a tempo costante manuale (Buffer.compare non è time-safe per stringhe hex di lunghezza diversa)
    if (mac.length !== expected.length) return null;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= mac.charCodeAt(i) ^ expected.charCodeAt(i);
    if (diff !== 0) return null;
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      u?: unknown;
      exp?: unknown;
    };
    if (typeof parsed.u !== "string" || typeof parsed.exp !== "number") return null;
    if (Date.now() > parsed.exp) return null; // scaduto
    return { tcUsername: parsed.u };
  } catch {
    return null;
  }
}

/** Tenta un login SSH password sul bridge CF per verificare le credenziali Linux del TC. */
async function verifyTcCredentials(tcUsername: string, tcPassword: string): Promise<boolean> {
  const bridge = await ensureTcSshBridge();
  if (!bridge.ok) return false;

  return new Promise((resolve) => {
    const conn = new SshClient();
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      try { conn.end(); } catch { /* ignore */ }
      resolve(ok);
    };

    const timeout = setTimeout(() => finish(false), 12_000);

    conn.on("ready", () => {
      clearTimeout(timeout);
      finish(true);
    });

    conn.on("error", () => {
      clearTimeout(timeout);
      finish(false);
    });

    conn.connect({
      host: "127.0.0.1",
      port: bridge.localPort,
      username: tcUsername,
      password: tcPassword,
      readyTimeout: 10_000,
      // ssh2 tenta automaticamente password auth quando `password` è fornita
      // e il server la offre nella lista dei metodi supportati.
    });
  });
}

// ── Brute-force guard for /terminal/auth ────────────────────────────────────
// Tracks per-IP failure counts in memory (intentionally not persisted across
// restarts — in-memory is acceptable for this risk level per task spec).
// Rules:
//   • Up to MAX_AUTH_FAILURES failed attempts are allowed per IP in AUTH_WINDOW_MS.
//   • Once the threshold is reached, the IP is locked for the remainder of the
//     window even if the correct password is supplied on a later attempt.
//   • The window starts at the first failure and expires AUTH_WINDOW_MS later.
//   • Successful logins before the threshold is reached do NOT reset the counter,
//     but the failure count never increments on success.

const MAX_AUTH_FAILURES = 5;
const AUTH_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

interface AuthFailureRecord {
  failures: number;
  windowStart: number; // epoch ms of first failure in current window
}

const authFailureMap = new Map<string, AuthFailureRecord>();

/** Returns true if this IP is currently locked out. */
function isAuthLockedOut(ip: string): boolean {
  const rec = authFailureMap.get(ip);
  if (!rec) return false;
  if (Date.now() - rec.windowStart >= AUTH_WINDOW_MS) {
    authFailureMap.delete(ip);
    return false;
  }
  return rec.failures >= MAX_AUTH_FAILURES;
}

/** Records a failed auth attempt for this IP. */
function recordAuthFailure(ip: string): void {
  const now = Date.now();
  const rec = authFailureMap.get(ip);
  if (!rec || now - rec.windowStart >= AUTH_WINDOW_MS) {
    // No record yet, or previous window has expired — start a fresh one.
    authFailureMap.set(ip, { failures: 1, windowStart: now });
  } else {
    rec.failures += 1;
  }
}

// POST /api/ssh/terminal/auth
// Accetta { tcUsername, tcPassword }, verifica le credenziali Linux del TC
// via SSH password auth sul bridge CF, restituisce { token } firmato.
// Non richiede sessione BikerLink: è l'endpoint di accesso TC-native.
router.post("/terminal/auth", async (req: Request, res: Response) => {
  const clientIp = getTrustedClientIp(req) ?? req.ip ?? "unknown";

  // Check lockout BEFORE doing anything else, so locked IPs get a fast 429
  // and cannot probe whether a particular username exists.
  if (isAuthLockedOut(clientIp)) {
    return res.status(429).json({
      error: "Troppi tentativi falliti. Riprova tra 15 minuti.",
    });
  }

  const body = req.body as { tcUsername?: unknown; tcPassword?: unknown };
  const tcUsername = typeof body.tcUsername === "string" ? body.tcUsername.trim() : "";
  const tcPassword = typeof body.tcPassword === "string" ? body.tcPassword : "";

  if (!tcUsername || !tcPassword) {
    return res.status(400).json({ error: "tcUsername e tcPassword sono obbligatori" });
  }

  // Blocca username con caratteri non validi per un utente Linux.
  if (!/^[a-z_][a-z0-9_-]{0,31}$/.test(tcUsername)) {
    return res.status(400).json({ error: "Nome utente TC non valido" });
  }

  try {
    const ok = await verifyTcCredentials(tcUsername, tcPassword);
    if (!ok) {
      recordAuthFailure(clientIp);
      // Re-check: if this failure just crossed the threshold, return 429 so
      // the attacker gets the same response as on subsequent locked requests.
      if (isAuthLockedOut(clientIp)) {
        console.warn(`[ssh/terminal/auth] IP ${clientIp} bloccato dopo ${MAX_AUTH_FAILURES} tentativi falliti`);
        return res.status(429).json({
          error: "Troppi tentativi falliti. Riprova tra 15 minuti.",
        });
      }
      return res.status(401).json({ error: "Credenziali TC non valide" });
    }
    const token = signTcToken(tcUsername);
    console.log(`[ssh/terminal/auth] accesso TC concesso per utente "${tcUsername}"`);
    return res.json({ token });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[ssh/terminal/auth] errore verifica credenziali: ${msg}`);
    return res.status(500).json({ error: "Errore interno durante la verifica delle credenziali" });
  }
});

export default router;
