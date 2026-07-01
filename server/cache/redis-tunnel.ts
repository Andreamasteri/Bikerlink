// =============================================================================
// Redis/DragonflyDB TCP bridge — Cloudflare Access (cloudflared access tcp).
//
// PERCHÉ ESISTE (Task #5261)
// La cache (DragonflyDB) gira sul ThinkCentre di casa. Il Cloudflare Tunnel del
// progetto espone SOLO hostname HTTP (gh/valhalla/...); Postgres e Redis NON
// vanno esposti come web pubblici (vedi infra/self-host/expose/cloudflared-config.yml).
// Il vecchio path `rediss://...@bikerlink.duckdns.org:6380` (nginx stream + LE)
// è stato dismesso con la migrazione a Cloudflare.
//
// Questo modulo apre un bridge TCP privato da Replit Cloud al DragonflyDB di casa
// usando il tooling sanzionato `cloudflared access tcp`: cloudflared si autentica
// all'edge Cloudflare con il SERVICE TOKEN di Cloudflare Access e mette in ascolto
// una porta locale (127.0.0.1:<localPort>) che inoltra, dentro il tunnel cifrato,
// alla porta 6379 del DragonflyDB sul TC. ioredis/BullMQ/Redlock si connettono al
// listener locale come se Redis fosse in localhost.
//
// CONFIGURAZIONE (env)
//   REDIS_TUNNEL_HOSTNAME    hostname Access del bridge TCP (es. redis-tc.biker-link.net).
//                            Se NON impostato → il bridge è DISATTIVO (no-op) e
//                            l'app usa direttamente TC_DRAGONFLY_URL.
//   REDIS_TUNNEL_LOCAL_PORT  porta locale del listener (default 16379).
//   CF_ACCESS_CLIENT_ID      service token id   (riusa il token già usato per gli altri servizi TC).
//   CF_ACCESS_CLIENT_SECRET  service token secret.
//   CLOUDFLARED_BIN          path del binario cloudflared (default: ./bin/cloudflared, poi "cloudflared" nel PATH).
//
// Con il bridge attivo, TC_DRAGONFLY_URL DEVE puntare al listener locale in chiaro:
//   TC_DRAGONFLY_URL=redis://:<password>@127.0.0.1:16379
// (niente `rediss://`: il TLS è gestito da cloudflared verso l'edge; il salto
//  localhost→cloudflared è in chiaro ma resta dentro il container).
//
// RESILIENZA
// - Se l'hostname o il service token non sono configurati → no-op silenzioso.
// - Se il binario cloudflared non è presente → warn + no-op (l'app degrada al
//   fallback in-memory di server/cache/redis.ts, nessun crash).
// - Il processo cloudflared è supervisionato: se esce, viene riavviato con backoff.
// - Nessun ramo è fatale: il bridge non deve mai impedire il boot.
// =============================================================================

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createConnection } from "node:net";
import path from "node:path";

interface TunnelState {
  enabled: boolean;
  running: boolean;
  hostname: string | null;
  localPort: number;
  restarts: number;
  lastError: string | null;
  lastExitAt: number | null;
}

const state: TunnelState = {
  enabled: false,
  running: false,
  hostname: null,
  localPort: 16379,
  restarts: 0,
  lastError: null,
  lastExitAt: null,
};

let child: ChildProcess | null = null;
let shuttingDown = false;
let startAttempted = false;

const MAX_BACKOFF_MS = 30_000;
const BASE_BACKOFF_MS = 1_000;

function resolveBin(): string | null {
  const explicit = process.env.CLOUDFLARED_BIN?.trim();
  if (explicit) return existsSync(explicit) ? explicit : null;
  // Default: binario baked dal deploy-build (./bin/cloudflared), poi PATH.
  const baked = path.resolve(process.cwd(), "bin", "cloudflared");
  if (existsSync(baked)) return baked;
  // Lascia che spawn risolva dal PATH; se assente, spawn emette ENOENT che
  // gestiamo come no-op.
  return "cloudflared";
}

/** Probe TCP best-effort sul listener locale: true se accetta connessioni. */
function probeLocalPort(port: number, timeoutMs = 1_000): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = createConnection({ host: "127.0.0.1", port });
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      try { sock.destroy(); } catch { /* ignore */ }
      resolve(ok);
    };
    sock.setTimeout(timeoutMs);
    sock.once("connect", () => finish(true));
    sock.once("timeout", () => finish(false));
    sock.once("error", () => finish(false));
  });
}

function spawnBridge(): void {
  if (shuttingDown) return;
  const bin = resolveBin();
  if (!bin) {
    state.lastError = "cloudflared binary not found (CLOUDFLARED_BIN/bin/cloudflared)";
    console.warn(`[redis-tunnel] ${state.lastError} — bridge disattivato, uso fallback diretto`);
    return;
  }

  const args = [
    "access", "tcp",
    "--hostname", state.hostname!,
    "--url", `127.0.0.1:${state.localPort}`,
  ];

  // Service token via env (NON in argv → non compare in `ps`).
  const env = {
    ...process.env,
    TUNNEL_SERVICE_TOKEN_ID: process.env.CF_ACCESS_CLIENT_ID ?? "",
    TUNNEL_SERVICE_TOKEN_SECRET: process.env.CF_ACCESS_CLIENT_SECRET ?? "",
  };

  console.log(`[redis-tunnel] avvio bridge: ${bin} access tcp --hostname ${state.hostname} --url 127.0.0.1:${state.localPort}`);

  let proc: ChildProcess;
  try {
    proc = spawn(bin, args, { env, stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    state.lastError = err instanceof Error ? err.message : String(err);
    console.warn(`[redis-tunnel] spawn fallito (${state.lastError}) — bridge disattivato, uso fallback diretto`);
    return;
  }

  child = proc;
  state.running = true;

  proc.stdout?.on("data", (d: Buffer) => {
    const line = d.toString().trim();
    if (line) console.log(`[redis-tunnel:cloudflared] ${line}`);
  });
  proc.stderr?.on("data", (d: Buffer) => {
    // cloudflared logga su stderr anche a livello INFO; non è necessariamente errore.
    const line = d.toString().trim();
    if (line) console.log(`[redis-tunnel:cloudflared] ${line}`);
  });

  proc.on("error", (err) => {
    state.lastError = err instanceof Error ? err.message : String(err);
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      console.warn(`[redis-tunnel] cloudflared non eseguibile (ENOENT) — bridge disattivato, uso fallback diretto`);
      shuttingDown = true; // niente restart loop su binario mancante
    } else {
      console.warn(`[redis-tunnel] errore processo cloudflared: ${state.lastError}`);
    }
  });

  proc.on("exit", (code, signal) => {
    state.running = false;
    state.lastExitAt = Date.now();
    child = null;
    if (shuttingDown) return;
    state.restarts += 1;
    const backoff = Math.min(BASE_BACKOFF_MS * 2 ** Math.min(state.restarts, 5), MAX_BACKOFF_MS);
    console.warn(
      `[redis-tunnel] cloudflared uscito (code=${code} signal=${signal}); ` +
      `restart #${state.restarts} tra ${backoff}ms`,
    );
    setTimeout(spawnBridge, backoff);
  });
}

/**
 * Avvia il bridge cloudflared (idempotente, non bloccante, MAI fatale).
 * Ritorna true se il listener locale risulta raggiungibile entro `waitMs`,
 * false altrimenti (il chiamante può comunque proseguire: il monitor TC farà
 * reInitRedis non appena la probe Redis passa).
 */
export async function startRedisTunnel(waitMs = 8_000): Promise<boolean> {
  if (startAttempted) {
    return state.running ? probeLocalPort(state.localPort) : false;
  }
  startAttempted = true;

  const hostname = process.env.REDIS_TUNNEL_HOSTNAME?.trim();
  if (!hostname) {
    console.log("[redis-tunnel] REDIS_TUNNEL_HOSTNAME non impostato — bridge disattivo (uso TC_DRAGONFLY_URL diretto)");
    return false;
  }
  if (!process.env.CF_ACCESS_CLIENT_ID || !process.env.CF_ACCESS_CLIENT_SECRET) {
    console.warn("[redis-tunnel] CF_ACCESS_CLIENT_ID/SECRET assenti — impossibile autenticare il bridge Access, disattivo");
    return false;
  }

  state.enabled = true;
  state.hostname = hostname;
  state.localPort = parseInt(process.env.REDIS_TUNNEL_LOCAL_PORT ?? "16379", 10) || 16379;

  spawnBridge();

  // Attende che il listener locale accetti connessioni (best-effort).
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    if (await probeLocalPort(state.localPort)) {
      console.log(`[redis-tunnel] listener locale pronto su 127.0.0.1:${state.localPort}`);
      return true;
    }
    await new Promise<void>((r) => setTimeout(r, 500));
  }
  console.warn(
    `[redis-tunnel] listener locale non pronto entro ${waitMs}ms — proseguo comunque ` +
    `(il monitor TC riproverà reInitRedis quando la probe Redis passa)`,
  );
  return false;
}

/** Ferma il bridge (chiamato in shutdown). Idempotente. */
export function stopRedisTunnel(): void {
  shuttingDown = true;
  if (child) {
    try { child.kill("SIGTERM"); } catch { /* ignore */ }
    child = null;
  }
  state.running = false;
}

export function getRedisTunnelStatus(): Readonly<TunnelState> {
  return { ...state };
}

export function isRedisTunnelEnabled(): boolean {
  return state.enabled;
}
