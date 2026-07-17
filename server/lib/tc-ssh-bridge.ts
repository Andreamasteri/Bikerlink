// =============================================================================
// ThinkCentre SSH bridge — Cloudflare Access (cloudflared access tcp).
//
// PERCHÉ ESISTE (Task #19)
// L'host SSH del ThinkCentre (ssh.biker-link.net) NON accetta connessioni TCP
// dirette sulla porta 22: è dietro Cloudflare Tunnel + Cloudflare Access. L'unico
// modo di raggiungerlo è tramite il tooling sanzionato `cloudflared access`, che
// si autentica all'edge Cloudflare con il SERVICE TOKEN di Access.
//
// Questo modulo apre un bridge TCP privato da Replit Cloud all'SSH di casa,
// riusando lo STESSO pattern collaudato di server/cache/redis-tunnel.ts:
// cloudflared mette in ascolto 127.0.0.1:<localPort> e inoltra, dentro il tunnel
// cifrato, alla porta SSH del TC. La route server (server/routes/ssh-exec.ts) si
// connette al listener locale con ssh2 usando la CHIAVE PRIVATA (TC_SSH_KEY) —
// niente più password diretta (TC_SSH_PASSWORD) né porta 22 esposta.
//
// CONFIGURAZIONE (env / secret)
//   TC_SSH_HOST              hostname Access SSH del tunnel (es. ssh.biker-link.net).
//   TC_SSH_BRIDGE_LOCAL_PORT porta locale del listener (default 12222).
//   CF_ACCESS_CLIENT_ID      service token id   (lo stesso già usato per gli altri servizi TC).
//   CF_ACCESS_CLIENT_SECRET  service token secret.
//   CLOUDFLARED_BIN          path del binario cloudflared (default: ./bin/cloudflared, poi "cloudflared" nel PATH).
//
// RESILIENZA (mai fatale)
// - Se hostname o service token non sono configurati → il bridge resta inattivo e
//   ensureTcSshBridge() ritorna un errore descrittivo (la route risponde 503-ish,
//   non crasha il processo).
// - Se il binario cloudflared non è presente → warn + errore descrittivo (baked in
//   fase di deploy da scripts/deploy-build.sh, come per il bridge Redis).
// - Il processo cloudflared è supervisionato: se esce viene riavviato con backoff.
// - L'avvio è lazy (alla prima richiesta SSH) e non blocca mai il boot.
//
// STALE-BRIDGE DETECTION + RESET SICURO (Task #506)
// - ensureTcSshBridge() rileva il caso state.running=true ma porta non raggiungibile
//   (TC riavviato o tunnel CF caduto) e termina il child stantio prima di ri-spaware.
// - forceBridgeReset() consente alla route SSH-WS di azzerare il flag "running"
//   dopo aver ricevuto ECONNREFUSED, così la prossima ensureTcSshBridge() non riusa
//   uno stato stantio.
// - RACE-SAFE: l'exit handler del vecchio processo è gated su identità di processo
//   (`if (proc !== child) return`). Quando terminiamo un child intenzionalmente
//   (reset o stale-kill), impostiamo `child = null` PRIMA di chiamare kill().
//   Così il successivo evento exit del vecchio processo trova child !== proc e
//   ritorna subito, senza mutare lo stato del nuovo child né pianificare restart
//   indesiderati.
// - spawnBridge() ha un guard `if (child) return` per evitare doppio-spawn.
// =============================================================================

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createConnection } from "node:net";
import path from "node:path";

interface BridgeState {
  running: boolean;
  hostname: string | null;
  localPort: number;
  restarts: number;
  lastError: string | null;
  lastExitAt: number | null;
}

const state: BridgeState = {
  running: false,
  hostname: null,
  localPort: 12222,
  restarts: 0,
  lastError: null,
  lastExitAt: null,
};

let child: ChildProcess | null = null;
let shuttingDown = false;

const MAX_BACKOFF_MS = 30_000;
const BASE_BACKOFF_MS = 1_000;

function resolveBin(): string | null {
  const explicit = process.env.CLOUDFLARED_BIN?.trim();
  if (explicit) return existsSync(explicit) ? explicit : null;
  const baked = path.resolve(process.cwd(), "bin", "cloudflared");
  if (existsSync(baked)) return baked;
  // Lascia che spawn risolva dal PATH; se assente, spawn emette ENOENT.
  return "cloudflared";
}

/** Hostname SSH del TC, ripulito da eventuale schema (`Https://`) e slash finale. */
export function tcSshHostname(): string {
  return (process.env.TC_SSH_HOST ?? "")
    .replace(/^https?:\/\//i, "")
    .trim()
    .replace(/\/+$/, "");
}

/** Probe TCP best-effort sul listener locale: true se accetta connessioni. */
export function probeLocalPort(port: number, timeoutMs = 1_000): Promise<boolean> {
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

  // Guard: non spawnare se esiste già un child vivo.
  // Evita doppio-spawn durante stale-reset o chiamate concorrenti.
  if (child) return;

  const bin = resolveBin();
  if (!bin) {
    state.lastError = "cloudflared binary not found (CLOUDFLARED_BIN/bin/cloudflared)";
    console.warn(`[tc-ssh-bridge] ${state.lastError} — bridge SSH non disponibile`);
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

  console.log(`[tc-ssh-bridge] avvio bridge: ${bin} access tcp --hostname ${state.hostname} --url 127.0.0.1:${state.localPort}`);

  let proc: ChildProcess;
  try {
    proc = spawn(bin, args, { env, stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    state.lastError = err instanceof Error ? err.message : String(err);
    console.warn(`[tc-ssh-bridge] spawn fallito (${state.lastError}) — bridge SSH non disponibile`);
    return;
  }

  child = proc;
  state.running = true;

  proc.stdout?.on("data", (d: Buffer) => {
    const line = d.toString().trim();
    if (line) console.log(`[tc-ssh-bridge:cloudflared] ${line}`);
  });
  proc.stderr?.on("data", (d: Buffer) => {
    // cloudflared logga su stderr anche a livello INFO; non è necessariamente errore.
    const line = d.toString().trim();
    if (line) console.log(`[tc-ssh-bridge:cloudflared] ${line}`);
  });

  proc.on("error", (err) => {
    // Ignora eventi da un processo che non è più il child corrente.
    if (child !== proc) return;
    state.lastError = err instanceof Error ? err.message : String(err);
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      console.warn(`[tc-ssh-bridge] cloudflared non eseguibile (ENOENT) — bridge SSH non disponibile`);
      shuttingDown = true; // niente restart loop su binario mancante
    } else {
      console.warn(`[tc-ssh-bridge] errore processo cloudflared: ${state.lastError}`);
    }
  });

  proc.on("exit", (code, signal) => {
    // RACE-SAFE: se questo processo non è più il child corrente (è stato sostituito
    // da forceBridgeReset / stale-reset prima che l'exit arrivasse), non tocchiamo
    // lo stato del nuovo processo né pianifichiamo restart indesiderati.
    if (child !== proc) return;

    state.running = false;
    state.lastExitAt = Date.now();
    child = null;
    if (shuttingDown) return;
    state.restarts += 1;
    const backoff = Math.min(BASE_BACKOFF_MS * 2 ** Math.min(state.restarts, 5), MAX_BACKOFF_MS);
    console.warn(
      `[tc-ssh-bridge] cloudflared uscito (code=${code} signal=${signal}); ` +
      `restart #${state.restarts} tra ${backoff}ms`,
    );
    setTimeout(spawnBridge, backoff);
  });
}

/**
 * Termina il processo bridge corrente (se attivo) e azzera lo stato "running"
 * senza pianificare un restart automatico. Usato quando una connessione SSH
 * riceve ECONNREFUSED sul localPort (stale bridge): la prossima chiamata a
 * ensureTcSshBridge() ripartirà da zero senza attendere il backoff.
 *
 * RACE-SAFE: `child` viene azzerato PRIMA di kill() così l'exit handler del
 * vecchio processo trova (child !== proc) e ritorna senza mutare lo stato.
 *
 * Idempotente e non fatale.
 */
export function forceBridgeReset(): void {
  const proc = child;
  if (proc) {
    console.warn("[tc-ssh-bridge] forceBridgeReset: terminazione bridge stantio");
    // Azzera child PRIMA di kill() — l'exit handler vedrà child !== proc e
    // si fermerà senza pianificare restart né sovrascrivere lo stato.
    child = null;
    try { proc.kill("SIGTERM"); } catch { /* ignore */ }
  }
  state.running = false;
  state.lastError = "bridge reset forzato (ECONNREFUSED dal chiamante)";
}

/**
 * Garantisce che il bridge SSH sia attivo e il listener locale raggiungibile.
 * Lazy + idempotente + non fatale. Ritorna { ok, localPort } se pronto, oppure
 * { ok:false, error } con un messaggio descrittivo (binario mancante, token/host
 * non configurati, timeout). Il chiamante decide come degradare.
 *
 * STALE DETECTION: se state.running=true ma il listener locale non risponde
 * (TC riavviato o tunnel CF caduto), il child viene terminato in modo race-safe
 * (child=null prima di kill, così l'exit handler è no-op) e il bridge viene
 * ri-stabilito immediatamente, senza aspettare il backoff del exit-handler.
 */
export async function ensureTcSshBridge(waitMs = 8_000): Promise<{ ok: boolean; localPort: number; error?: string }> {
  shuttingDown = false;

  const hostname = tcSshHostname();
  if (!hostname) {
    return { ok: false, localPort: state.localPort, error: "TC_SSH_HOST non configurato" };
  }
  if (!process.env.CF_ACCESS_CLIENT_ID || !process.env.CF_ACCESS_CLIENT_SECRET) {
    return {
      ok: false,
      localPort: state.localPort,
      error: "CF_ACCESS_CLIENT_ID/SECRET assenti — impossibile autenticare il bridge Cloudflare Access",
    };
  }

  state.hostname = hostname;
  state.localPort = parseInt(process.env.TC_SSH_BRIDGE_LOCAL_PORT ?? "12222", 10) || 12222;

  // Se già in ascolto, riusa.
  if (state.running && (await probeLocalPort(state.localPort))) {
    return { ok: true, localPort: state.localPort };
  }

  // STALE-BRIDGE DETECTION: state.running=true ma porta non raggiungibile.
  // Terminiamo il child stantio in modo race-safe: child=null PRIMA di kill()
  // così il suo exit handler vedrà (proc !== child) e non pianificherà restart.
  if (state.running && child) {
    console.warn(
      `[tc-ssh-bridge] bridge segnalato running ma porta ${state.localPort} non raggiungibile — ` +
      "re-stabilire (stale bridge)",
    );
    const staleProc = child;
    child = null; // azzera PRIMA di kill per bloccare l'exit handler del vecchio proc
    state.running = false;
    try { staleProc.kill("SIGTERM"); } catch { /* ignore */ }
  }

  // spawnBridge() ha il guard `if (child) return` — nessun doppio-spawn.
  if (!child) spawnBridge();

  // Se lo spawn non è partito (binario mancante), state.running resta false.
  if (!state.running && !child) {
    return {
      ok: false,
      localPort: state.localPort,
      error: state.lastError ?? "cloudflared non disponibile",
    };
  }

  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    if (await probeLocalPort(state.localPort)) {
      return { ok: true, localPort: state.localPort };
    }
    await new Promise<void>((r) => setTimeout(r, 400));
  }
  return {
    ok: false,
    localPort: state.localPort,
    error: `listener locale non pronto entro ${waitMs}ms (${state.lastError ?? "cloudflared non ha aperto la porta"})`,
  };
}

/** Ferma il bridge (chiamato in shutdown). Idempotente. */
export function stopTcSshBridge(): void {
  shuttingDown = true;
  const proc = child;
  child = null; // azzera prima di kill per neutralizzare l'exit handler
  if (proc) {
    try { proc.kill("SIGTERM"); } catch { /* ignore */ }
  }
  state.running = false;
}

export function getTcSshBridgeStatus(): Readonly<BridgeState> {
  return { ...state };
}
