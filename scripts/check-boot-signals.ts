/**
 * check-boot-signals.ts — Task #1024
 *
 * Verifica one-shot 3 segnali chiave del boot di produzione via /api/admin/boot-log:
 *
 *   1. Neon connesso — entry con msg "[BOOT][DB] Endpoint:" contiene "neon.tech"
 *   2. Phase 3 sana — entry "[3/5] DB Init" con msg="done" e ok=true
 *   3. Server READY — entry phase="READY" con ok=true
 *
 * Usage:
 *   npx tsx scripts/check-boot-signals.ts
 *   npm run check:boot
 *
 * Env:
 *   EXPO_PUBLIC_DOMAIN   URL base del server (es. "myapp.replit.app" o "localhost:5000")
 *   SESSION_COOKIE       Cookie di sessione admin (connect.sid=…)
 *   ADMIN_USER_ID        UUID admin (alternativa a SESSION_COOKIE, richiede SESSION_SECRET)
 *   SESSION_SECRET       Secret per auto-derivare la sessione da ADMIN_USER_ID
 */

import { createAdminSession, destroyAdminSession } from "./lib/admin-session";

// ── Config ────────────────────────────────────────────────────────────────────

const RAW_DOMAIN = process.env.EXPO_PUBLIC_DOMAIN ?? "localhost:5000";
const BASE = RAW_DOMAIN.startsWith("http") ? RAW_DOMAIN : `https://${RAW_DOMAIN}`;
const TIMEOUT_MS = 10_000;

interface BootLogEntry {
  ts: number;
  elapsed_ms: number;
  phase: string;
  msg: string;
  ok: boolean | null;
}

interface BootLogResponse {
  summary: {
    complete: boolean;
    hasError: boolean;
    totalEntries: number;
    startTs: number | null;
    lastTs: number | null;
    totalElapsedMs: number | null;
  };
  entries: BootLogEntry[];
}

// ── Auth setup ────────────────────────────────────────────────────────────────

let SESSION_COOKIE: string | undefined = process.env.SESSION_COOKIE;
let autoDerivedSid: string | undefined;

async function setupAuth(): Promise<void> {
  if (SESSION_COOKIE) return;

  const adminId = process.env.ADMIN_USER_ID;
  if (adminId && process.env.SESSION_SECRET) {
    const sess = await createAdminSession(adminId, { ttlSeconds: 300 });
    SESSION_COOKIE = sess.cookieHeader;
    autoDerivedSid = sess.sid;
    console.log(`[auth] SESSION_COOKIE auto-derivato da ADMIN_USER_ID (sid=${sess.sid.slice(0, 8)}…)`);
  } else {
    console.error(
      "AUTH: SESSION_COOKIE non settato e ADMIN_USER_ID/SESSION_SECRET non disponibili.\n" +
      "Esporta SESSION_COOKIE='connect.sid=…' oppure imposta ADMIN_USER_ID + SESSION_SECRET.",
    );
    process.exit(2);
  }
}

async function cleanupAuth(): Promise<void> {
  if (autoDerivedSid) {
    try {
      await destroyAdminSession(autoDerivedSid);
    } catch {
      // best-effort
    }
  }
}

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { accept: "application/json" };
  if (SESSION_COOKIE) h["cookie"] = SESSION_COOKIE;
  return h;
}

// ── Fetch boot log ────────────────────────────────────────────────────────────

async function fetchBootLog(): Promise<BootLogResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${BASE}/api/admin/boot-log`, {
      headers: authHeaders(),
      signal: controller.signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new Error(
        `Timeout (${TIMEOUT_MS / 1000}s) raggiunto — il server non ha risposto.\n` +
        `Verifica che ${BASE} sia raggiungibile e che il server sia avviato.`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 503) {
    throw new Error(
      `Server risponde 503 — è ancora in fase di boot. Riprova tra qualche secondo.\n` +
      `(GET ${BASE}/api/admin/boot-log → 503)`,
    );
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `Autenticazione fallita (HTTP ${res.status}).\n` +
      `Verifica che SESSION_COOKIE sia valido e che l'utente sia admin.`,
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GET /api/admin/boot-log → HTTP ${res.status}\n${body.slice(0, 300)}`);
  }

  return res.json() as Promise<BootLogResponse>;
}

// ── Checks ────────────────────────────────────────────────────────────────────

interface CheckResult {
  label: string;
  passed: boolean;
  detail: string;
}

/** Check 1: entry con msg "[BOOT][DB] Endpoint:" contiene "neon.tech" */
function checkNeonEndpoint(entries: BootLogEntry[]): CheckResult {
  const label = "Neon endpoint";
  // L'entry è emessa da addBootLog con msg che contiene il testo dell'endpoint.
  // Cerca in tutti i campi msg e phase per robustezza.
  const match = entries.find(
    (e) =>
      e.msg.includes("[BOOT][DB] Endpoint:") ||
      e.phase.includes("[BOOT][DB] Endpoint:"),
  );

  if (!match) {
    return {
      label,
      passed: false,
      detail:
        "Entry '[BOOT][DB] Endpoint:' non trovata nel boot log.\n" +
        "  Causa probabile: il segnale è emesso solo via console.log nel boot-sequence, " +
        "non via addBootLog — non viene catturato dall'API /api/admin/boot-log.\n" +
        "  Azione: aggiungere addBootLog nella sezione 'DB endpoint log' di server/boot-sequence.ts.",
    };
  }

  const text = `${match.phase} ${match.msg}`;
  if (!text.includes("neon.tech")) {
    return {
      label,
      passed: false,
      detail:
        `Entry trovata ma l'host NON è neon.tech:\n  phase="${match.phase}" msg="${match.msg}"\n` +
        `  Verifica che DATABASE_URL punti a un endpoint Neon.`,
    };
  }

  return {
    label,
    passed: true,
    detail: `Host neon.tech confermato — "${match.msg.slice(0, 120)}"`,
  };
}

/** Check 2: "[3/5] DB Init" con msg="done" e ok=true */
function checkPhase3Done(entries: BootLogEntry[]): CheckResult {
  const label = "Phase 3 DB Init done";

  // La fase è registrata con phase="[3/5] DB Init" (TOTAL_PHASES=5 nel boot-sequence.ts)
  // ma potrebbe variare se TOTAL_PHASES cambia. Cerchiamo con pattern flessibile.
  const doneEntry = entries.find(
    (e) =>
      (e.phase.includes("DB Init") || e.phase.match(/\[3\/\d+\]/)) &&
      e.msg === "done",
  );

  if (!doneEntry) {
    // Controlla se esiste almeno il "start" — aiuta la diagnosi
    const startEntry = entries.find(
      (e) =>
        (e.phase.includes("DB Init") || e.phase.match(/\[3\/\d+\]/)) &&
        e.msg === "start",
    );
    if (startEntry) {
      return {
        label,
        passed: false,
        detail:
          `Phase 3 "start" trovato (elapsed ${startEntry.elapsed_ms}ms) ma "done" mancante.\n` +
          `  La fase DB Init è in corso o si è bloccata. Controlla i log del server.`,
      };
    }
    return {
      label,
      passed: false,
      detail:
        `Nessuna entry "DB Init" trovata nel boot log (né "start" né "done").\n` +
        `  Il server potrebbe non aver raggiunto la Phase 3 o il boot è ancora in corso.`,
    };
  }

  if (doneEntry.ok !== true) {
    return {
      label,
      passed: false,
      detail:
        `Phase 3 "done" trovato ma ok=${doneEntry.ok} (atteso true).\n` +
        `  phase="${doneEntry.phase}" msg="${doneEntry.msg}" elapsed=${doneEntry.elapsed_ms}ms`,
    };
  }

  return {
    label,
    passed: true,
    detail: `"${doneEntry.phase}" done senza errori (elapsed ${doneEntry.elapsed_ms}ms)`,
  };
}

/** Check 3: entry phase="READY" con ok=true */
function checkReady(entries: BootLogEntry[], summary: BootLogResponse["summary"]): CheckResult {
  const label = "Server READY";

  const readyEntry = entries.find((e) => e.phase === "READY" && e.ok === true);

  if (!readyEntry) {
    // Potrebbe esserci un READY con ok=false o null
    const anyReady = entries.find((e) => e.phase === "READY");
    if (anyReady) {
      return {
        label,
        passed: false,
        detail:
          `Entry READY trovata ma ok=${anyReady.ok} (atteso true).\n` +
          `  msg="${anyReady.msg}"`,
      };
    }
    return {
      label,
      passed: false,
      detail:
        `Nessuna entry con phase="READY" trovata nel boot log.\n` +
        `  Il server potrebbe non aver completato l'avvio. Entries totali: ${summary.totalEntries}`,
    };
  }

  // Calcola il tempo di boot totale
  const bootSecs = summary.totalElapsedMs != null
    ? ` — boot totale ${(summary.totalElapsedMs / 1000).toFixed(1)}s`
    : "";

  // Estrai il tempo dalla msg se presente (es. "Critical phases completed in 12.3s — server is READY")
  const timeMatch = readyEntry.msg.match(/(\d+\.\d+)s/);
  const bootTime = timeMatch ? ` (fase critica: ${timeMatch[1]}s)` : "";

  return {
    label,
    passed: true,
    detail: `Server READY confermato${bootTime}${bootSecs}`,
  };
}

// ── Report ────────────────────────────────────────────────────────────────────

/**
 * Stampa il report dei check e restituisce true se il boot è "clean"
 * (tutti i check superati E nessun errore nel summary).
 *
 * Con hasError=true i 3 check principali possono passare, ma il boot non è
 * completamente sano — viene emesso un ⚠ warning con l'elenco delle entry
 * con ok=false.
 *
 * L'exit code rimane 0 (WARN non è fatale), a meno che non sia passato
 * --strict, nel qual caso hasError=true causa exit 1.
 */
function printReport(
  checks: CheckResult[],
  summary: BootLogResponse["summary"],
  entries: BootLogEntry[],
): { allPassed: boolean; hasError: boolean } {
  const LINE = "═".repeat(62);
  console.log(`\n${LINE}`);
  console.log("  check-boot-signals — Segnali chiave boot produzione");
  console.log(`  Server: ${BASE}`);
  console.log(LINE);

  const allPassed = checks.every((c) => c.passed);

  for (const c of checks) {
    const icon = c.passed ? "✓" : "✗";
    console.log(`\n  ${icon} ${c.label}`);
    // Indent detail lines
    for (const line of c.detail.split("\n")) {
      console.log(`    ${line}`);
    }
  }

  // ── hasError warning ──────────────────────────────────────────────────────
  if (allPassed && summary.hasError) {
    const failedEntries = entries.filter((e) => e.ok === false);
    console.log(`\n  ⚠ ATTENZIONE — READY raggiunto ma con errori nel boot log:`);
    for (const e of failedEntries) {
      console.log(`    • [${e.phase}] ${e.msg} (elapsed ${e.elapsed_ms}ms)`);
    }
    console.log(
      `\n    Il server è operativo ma alcune fasi non critiche hanno fallito.`,
    );
    console.log(
      `    Usa --strict per uscire con codice 1 in presenza di hasError=true.`,
    );
  }

  console.log(`\n${LINE}`);
  if (allPassed && !summary.hasError) {
    console.log("  ✅ TUTTI I CHECK SUPERATI — boot produzione sano");
  } else if (allPassed && summary.hasError) {
    console.log("  ⚠  CHECK SUPERATI CON AVVISI — READY ma con errori nel log");
  } else {
    const failed = checks.filter((c) => !c.passed).map((c) => c.label).join(", ");
    console.log(`  ❌ CHECK FALLITI: ${failed}`);
  }
  console.log(`${LINE}\n`);

  return { allPassed, hasError: summary.hasError };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const strict = process.argv.includes("--strict");

  console.log(`[check-boot-signals] Server: ${BASE}${strict ? " [--strict]" : ""}`);

  await setupAuth();

  let data: BootLogResponse;
  try {
    data = await fetchBootLog();
  } catch (err) {
    console.error(`\n❌ ERRORE — impossibile leggere il boot log:\n  ${(err as Error).message}`);
    await cleanupAuth();
    process.exit(1);
  }

  const { summary, entries } = data;
  console.log(
    `[check-boot-signals] Boot log: ${entries.length} entries, ` +
    `complete=${summary.complete}, hasError=${summary.hasError}`,
  );

  const checks: CheckResult[] = [
    checkNeonEndpoint(entries),
    checkPhase3Done(entries),
    checkReady(entries, summary),
  ];

  const { allPassed, hasError } = printReport(checks, summary, entries);

  await cleanupAuth();

  if (!allPassed) {
    process.exit(1);
  }
  if (strict && hasError) {
    console.error("[check-boot-signals] --strict: uscita 1 per hasError=true");
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("[check-boot-signals] FATAL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
