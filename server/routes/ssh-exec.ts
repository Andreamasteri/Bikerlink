import { Router, type Request, type Response } from "express";
import { Client as SshClient } from "ssh2";
import { storage } from "../storage";

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

function execSsh(command: string, timeoutMs = 30_000): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const host = (process.env.TC_SSH_HOST ?? "").replace(/^https?:\/\//i, "").trim();
    const username = process.env.TC_SSH_USER;
    const password = process.env.TC_SSH_PASSWORD;

    if (!host || !username) {
      return reject(new Error("TC_SSH_HOST e TC_SSH_USER non configurati"));
    }
    if (!password) {
      return reject(new Error("TC_SSH_PASSWORD deve essere configurato"));
    }

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
      host,
      port: parseInt(process.env.TC_SSH_PORT ?? "22", 10),
      username,
      password,
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

export default router;
