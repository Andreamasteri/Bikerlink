// LARGE-FILE-ALLOW: script triage Horus monolitico (aggregation pipeline completa, split non praticabile)
/**
 * BikerLink — Triage AI completo con Horus
 *
 * Aggrega tutte le fonti di log di BikerLink (DB interno, filesystem, GitHub
 * Issues/Actions, Sentry EU, albero repo) e le invia al modello Horus
 * (qwen3:4b sul ThinkCentre via Ollama) per un'analisi AI strutturata.
 * Dopo il report principale, una seconda chiamata a Horus (ruolo architect)
 * filtra i task proposti contro il backlog esistente. Infine, lo script
 * companion `horus-propose-tasks.ts` prepara i file plan e il manifest JSON
 * pronti per la proposta formale nel pannello Replit.
 *
 * Uso:
 *   npx tsx scripts/log-analysis-horus.ts
 *   npx tsx scripts/log-analysis-horus.ts --only-internal   # salta GitHub e Sentry
 *   npx tsx scripts/log-analysis-horus.ts --tail 500        # più righe per log
 *   npx tsx scripts/log-analysis-horus.ts --dry-run         # mostra bundle, non chiama Horus
 *   npx tsx scripts/log-analysis-horus.ts --no-propose      # salta proposta task formale
 *
 * Secret/env:
 *   HORUS_OLLAMA_URL    — URL base di Horus (ThinkCentre) via Cloudflare Tunnel (obbligatorio)
 *   HORUS_OLLAMA_MODEL  — modello da usare (default "qwen3:4b")
 *   HORUS_OLLAMA_TOKEN  — opzionale, Bearer token se l'endpoint è protetto
 *   (Alias legacy: OLLAMA_URL / OLLAMA_MODEL / OLLAMA_TOKEN — accettati come fallback)
 *   GITHUB_TOKEN  — token GitHub (fallback: DIAG_GITHUB_TOKEN)
 *   SENTRY_AUTH_TOKEN  — User Auth Token Sentry, scope project:read
 *   SENTRY_ORG         — Organization slug Sentry
 *   SENTRY_PROJECT     — Project slug Sentry
 *   SENTRY_BASE_URL    — default "https://de.sentry.io/api/0" (istanza EU)
 */

import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { db } from "../server/db";
import { sql } from "drizzle-orm";
import { cfAccessHeaders } from "../server/lib/cf-access";
import { AGENT_MODEL_DEFAULTS } from "../server/lib/agent-constants";
import { stripThinkBlock } from "../server/lib/ollama-think-strip";
import { collectGitHub, collectSentry, collectGitHubRepoTree } from "./lib/horus-sources";
import { estimateTokens, fmtSection, trimBundleToFit } from "./lib/horus-trim";
import { normalizeTaskSection } from "./lib/horus-normalize";
import {
  collectBacklogTitles,
  loadCancelledRefs,
  readCancelledRefsAge,
} from "./lib/horus-backlog";
import { cleanupStaleHorusFiles as _cleanupStaleHorusFiles } from "./lib/horus-cleanup";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ─── Configurazione ───────────────────────────────────────────────────────────

/** File di log da includere (tail delle ultime righe). I mancanti vengono saltati. */
const LOG_FILES: string[] = [
  "/tmp/server-crash.log",
  "/tmp/backend.log",
  "logs/backend-crashes.log",
  "logs/error-monitor.log",
  "logs/cerbero.log",
  "logs/watchdog.log",
  "logs/uptime-resets.log",
  "logs/ota-timing.log",
  "logs/apk-build-current.log",
  "logs/cleanup-cache.log",
  "/tmp/metro.log",
  "/tmp/metro-session.log",
];

/** Righe finali da prendere per ogni file di log (override con --tail N). */
const DEFAULT_TAIL_LINES = 500;

/**
 * Numero di righe ridotto usato come ultimo fallback se il bundle è ancora sopra
 * budget dopo la rimozione delle sezioni a bassa priorità.
 */
const REDUCED_TAIL_LINES = 100;

/** Timeout chiamata Horus (ms). Il qwen3:4b sul ThinkCentre impiega tipicamente 20-60s. */
const REQUEST_TIMEOUT_MS = 300_000;

const DEFAULT_MODEL = AGENT_MODEL_DEFAULTS.horus;

// Task #684 — con Ollama ≥0.30.11, `options.think` non funziona (content vuoto).
// `think` va passato al livello TOP-LEVEL della request, non dentro `options`.
// Default: think:true (HORUS_THINK=0 per disabilitare il ragionamento).
// Con Ollama ≥0.30.11 e think top-level, il reasoning finisce in message.thinking
// e message.content può essere vuoto → il fallback recupera message.thinking.
// num_predict ridotto a 600 se think:false.
const HORUS_THINK_ENABLED = process.env.HORUS_THINK !== "0";

// ─── CLI args ─────────────────────────────────────────────────────────────────

const IS_DRY_RUN = process.argv.includes("--dry-run");
const ONLY_INTERNAL = process.argv.includes("--only-internal");
const NO_PROPOSE = process.argv.includes("--no-propose");

function parseTailArg(): number {
  const i = process.argv.indexOf("--tail");
  if (i !== -1 && process.argv[i + 1]) {
    const n = parseInt(process.argv[i + 1], 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return DEFAULT_TAIL_LINES;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Legge le ultime `tail` righe di un file. Ritorna null se assente/illeggibile. */
function readTail(relOrAbs: string, tail: number): string | null {
  const abs = path.isAbsolute(relOrAbs) ? relOrAbs : path.join(ROOT, relOrAbs);
  try {
    if (!fs.existsSync(abs)) return null;
    const content = fs.readFileSync(abs, "utf8");
    if (!content.trim()) return null;
    const lines = content.split("\n");
    return lines.slice(-tail).join("\n");
  } catch {
    return null;
  }
}

function rowsToText(rows: unknown[]): string {
  if (!rows || rows.length === 0) return "(nessuna riga)";
  return rows.map((r, i) => `[${i + 1}] ${JSON.stringify(r)}`).join("\n");
}

// ─── Raccolta fonti DB ────────────────────────────────────────────────────────

interface DbSection { title: string; text: string }

async function collectDb(): Promise<DbSection[]> {
  const queries: Array<{ title: string; query: Promise<{ rows: unknown[] }> }> = [
    // ── Parte 1: crash logs espansi (no LEFT troncante) ──
    {
      title: "app_crash_logs (ultimi 60 crash)",
      query: db.execute(sql`
        SELECT crash_type, error_message, stack_trace, session_id, device_model,
               reported_at, platform, app_version
        FROM app_crash_logs ORDER BY reported_at DESC LIMIT 60
      `),
    },
    {
      title: "app_crash_logs — distribuzione crash_type/platform",
      query: db.execute(sql`
        SELECT crash_type, platform, COUNT(*) AS count
        FROM app_crash_logs
        GROUP BY crash_type, platform
        ORDER BY count DESC
      `),
    },
    {
      title: "ai_watchdog_log (ultimi 80)",
      query: db.execute(sql`
        SELECT kind, scope, status, summary, details, created_at
        FROM ai_watchdog_log ORDER BY created_at DESC LIMIT 80
      `),
    },
    {
      title: "system_signals high/critical (ultimi 80)",
      query: db.execute(sql`
        SELECT source, metric, severity, value, unit, details, created_at
        FROM system_signals WHERE severity IN ('high', 'critical')
        ORDER BY created_at DESC LIMIT 80
      `),
    },
    {
      title: "system_signals — distribuzione ultime 24h per source/metric/severity",
      query: db.execute(sql`
        SELECT source, metric, severity, COUNT(*) AS count
        FROM system_signals
        WHERE created_at > NOW() - INTERVAL '24 hours'
        GROUP BY source, metric, severity
        ORDER BY count DESC
      `),
    },
    {
      title: "diagnostic_reports (ultimi 15)",
      query: db.execute(sql`
        SELECT summary, results, platform, app_version, run_at
        FROM diagnostic_reports ORDER BY run_at DESC LIMIT 15
      `),
    },
    {
      title: "ai_call_logs degraded/errore (ultimi 50)",
      query: db.execute(sql`
        SELECT provider, model_id, latency_ms, degraded, error, created_at
        FROM ai_call_logs WHERE degraded = true OR latency_ms > 10000
        ORDER BY created_at DESC LIMIT 50
      `),
    },
    {
      title: "ai_call_logs security_blocked (ultimi 20)",
      query: db.execute(sql`
        SELECT provider, model_id, error, created_at
        FROM ai_call_logs WHERE security_blocked = true
        ORDER BY created_at DESC LIMIT 20
      `),
    },
    {
      title: "ai_call_logs — distribuzione ultime 48h per provider/model",
      query: db.execute(sql`
        SELECT provider, model_id,
               COUNT(*) AS total,
               SUM(degraded::int) AS degraded_count,
               SUM(security_blocked::int) AS security_blocked_count,
               ROUND(AVG(latency_ms)) AS avg_latency_ms
        FROM ai_call_logs
        WHERE created_at > NOW() - INTERVAL '48 hours'
        GROUP BY provider, model_id
        ORDER BY total DESC
      `),
    },
    {
      title: "ota_watchdog_reports (ultimi 5)",
      query: db.execute(sql`
        SELECT * FROM ota_watchdog_reports ORDER BY created_at DESC LIMIT 5
      `).catch(() => ({ rows: [] as unknown[] })),
    },

    // ── Parte 2: sistema e config ──
    {
      title: "app_settings (tutte le chiavi)",
      query: db.execute(sql`
        SELECT key, value, value_json, description, updated_at
        FROM app_settings ORDER BY key ASC
      `),
    },
    {
      title: "system_health_snapshot (ultimi 3)",
      query: db.execute(sql`
        SELECT status, score, problems, metrics, created_at
        FROM system_health_snapshot ORDER BY created_at DESC LIMIT 3
      `),
    },
    {
      title: "db_monitor_history — carico orario ultime 24h",
      query: db.execute(sql`
        SELECT date_trunc('hour', sampled_at) AS hour,
               ROUND(AVG(pool_active_pct)::numeric, 1) AS avg_pool_active_pct,
               MAX(pool_waiting) AS max_pool_waiting,
               MAX(ping_ms) AS max_ping_ms,
               SUM(db_error_count) AS sum_db_errors,
               bool_or(db_overload) AS any_overload
        FROM db_monitor_history
        WHERE sampled_at > NOW() - INTERVAL '24 hours'
        GROUP BY date_trunc('hour', sampled_at)
        ORDER BY hour DESC
      `),
    },
    {
      title: "feedback_tickets aperti (ultimi 20)",
      query: db.execute(sql`
        SELECT ticket_type, subject, message, device_info, created_at
        FROM feedback_tickets WHERE status = 'open'
        ORDER BY created_at DESC LIMIT 20
      `),
    },

    // ── Parte 3: integrity e AI jobs ──
    {
      // NOTA: violations_found in questa tabella è il conteggio al momento del run,
      // NON il numero di violazioni attualmente aperte. Per il totale aperte usare
      // la query "db_integrity_violations — conteggio aperte" qui sotto.
      title: "db_integrity_runs (ultimi 5)",
      query: db.execute(sql`
        SELECT trigger, violations_found, auto_fixed, manual_pending, expensive, run_at
        FROM db_integrity_runs ORDER BY run_at DESC LIMIT 5
      `).catch(() => ({ rows: [] as unknown[] })),
    },
    {
      // Conteggio diretto delle violazioni aperte — fonte di verità unica.
      // Questo numero può differire da violations_found nei runs (storico per-run).
      title: "db_integrity_violations — conteggio aperte (source of truth)",
      query: db.execute(sql`
        SELECT COUNT(*) AS open_violations_count
        FROM db_integrity_violations WHERE status != 'resolved'
      `).catch(() => ({ rows: [] as unknown[] })),
    },
    {
      title: "db_integrity_violations non risolte (ultime 30)",
      query: db.execute(sql`
        SELECT check_name, category, severity, count, sample, details, status, created_at
        FROM db_integrity_violations WHERE status != 'resolved'
        ORDER BY created_at DESC LIMIT 30
      `).catch(() => ({ rows: [] as unknown[] })),
    },
    {
      title: "ai_analysis_runs (ultimi 10)",
      query: db.execute(sql`
        SELECT persona, trigger, status, error_message, duration_ms, created_at
        FROM ai_analysis_runs ORDER BY created_at DESC LIMIT 10
      `).catch(() => ({ rows: [] as unknown[] })),
    },
    {
      title: "ai_knowledge_gaps open (top 20 per occorrenze)",
      query: db.execute(sql`
        SELECT question, persona, top_score, occurrences, last_seen_at
        FROM ai_knowledge_gaps WHERE status = 'open'
        ORDER BY occurrences DESC LIMIT 20
      `).catch(() => ({ rows: [] as unknown[] })),
    },
    {
      title: "ai_vps_jobs (ultimi 10)",
      query: db.execute(sql`
        SELECT kind, status, command, error_message, started_at, finished_at
        FROM ai_vps_jobs ORDER BY started_at DESC LIMIT 10
      `).catch(() => ({ rows: [] as unknown[] })),
    },
    {
      title: "maps_telemetry_events errori (ultimi 50)",
      query: db.execute(sql`
        SELECT event, details, created_at
        FROM maps_telemetry_events
        WHERE event LIKE '%_error' OR event LIKE '%_failed' OR event LIKE '%_crash'
        ORDER BY created_at DESC LIMIT 50
      `).catch(() => ({ rows: [] as unknown[] })),
    },
    {
      title: "pipeline_monitor (ultimi 10)",
      query: db.execute(sql`
        SELECT * FROM pipeline_probe_history ORDER BY run_at DESC LIMIT 10
      `).catch(() => ({ rows: [] as unknown[] })),
    },

    // ── Parte 4: OTA e distribuzioni ──
    {
      title: "ota_releases (ultimi 5)",
      query: db.execute(sql`
        SELECT channel, runtime_version, ota_version, status, message,
               boot_success_count, boot_failure_count, auto_rollback_enabled,
               published_at, approved_at, auto_rolled_back_at
        FROM ota_releases ORDER BY published_at DESC LIMIT 5
      `).catch(() => ({ rows: [] as unknown[] })),
    },
    {
      title: "ota_boot_events fallimenti (ultimi 30)",
      query: db.execute(sql`
        SELECT event_type, platform, device_model, app_version, created_at
        FROM ota_boot_events WHERE event_type = 'failure'
        ORDER BY created_at DESC LIMIT 30
      `).catch(() => ({ rows: [] as unknown[] })),
    },
    {
      title: "weekly_system_reports (ultimo 1)",
      query: db.execute(sql`
        SELECT payload, week_start, model_used
        FROM weekly_system_reports ORDER BY week_start DESC LIMIT 1
      `).catch(() => ({ rows: [] as unknown[] })),
    },

    // ── Parte 5: pg_stat_* (DB internals) ──
    {
      title: "pg_stat_user_tables — bloat e seq scan (top 20)",
      query: db.execute(sql`
        SELECT relname AS table_name,
               n_dead_tup,
               seq_scan,
               n_live_tup,
               last_autovacuum,
               last_analyze
        FROM pg_stat_user_tables
        ORDER BY n_dead_tup DESC LIMIT 20
      `),
    },
    {
      title: "pg_stat_activity — connessioni attive/idle in transaction",
      query: db.execute(sql`
        SELECT state, wait_event_type, wait_event,
               LEFT(query, 200) AS query_preview,
               query_start, application_name
        FROM pg_stat_activity
        WHERE state IN ('active', 'idle in transaction')
      `),
    },
  ];

  const results = await Promise.allSettled(queries.map((q) => q.query));
  const sections: DbSection[] = [];
  for (let i = 0; i < queries.length; i++) {
    const result = results[i];
    const { title } = queries[i];
    if (result.status === "fulfilled") {
      sections.push({ title, text: rowsToText(result.value.rows as unknown[]) });
    } else {
      const errMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
      sections.push({ title, text: `[ERRORE QUERY: ${errMsg.slice(0, 200)}]` });
    }
  }
  return sections;
}

// ─── Raccolta filesystem log ──────────────────────────────────────────────────

function collectLogs(tail: number): Array<{ file: string; text: string | null }> {
  return LOG_FILES.map((f) => ({ file: f, text: readTail(f, tail) }));
}

// ─── Parte 6: Stack trace file resolution ─────────────────────────────────────

/**
 * Parsa i crash log, estrae i path sorgente citati negli stack trace,
 * legge le righe ±10 attorno alla linea menzionata e restituisce una
 * sezione testuale con i frammenti di codice sorgente.
 */
function resolveStackTraceFiles(crashRows: unknown[]): string {
  if (!crashRows || crashRows.length === 0) return "(nessun crash log disponibile)";

  // Regex: estrae "server/", "shared/", "scripts/", "client/" path con numero di riga
  const stackLineRe = /at\s+\S+\s+\(?((?:server|shared|scripts|client)\/[^):]+):(\d+)/g;

  // Mappa path → lista numeri di riga menzionati
  const fileHits = new Map<string, number[]>();

  for (const row of crashRows) {
    const r = row as Record<string, unknown>;
    const st = typeof r.stack_trace === "string" ? r.stack_trace : "";
    if (!st) continue;
    let m: RegExpExecArray | null;
    while ((m = stackLineRe.exec(st)) !== null) {
      const filePath = m[1];
      const lineNum = parseInt(m[2], 10);
      if (!fileHits.has(filePath)) fileHits.set(filePath, []);
      fileHits.get(filePath)!.push(lineNum);
    }
  }

  if (fileHits.size === 0) return "(nessun path sorgente estratto dagli stack trace)";

  // Ordina per frequenza (file più citati prima), prendi top 10
  const sorted = [...fileHits.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 10);

  const parts: string[] = [];

  for (const [relPath, lineNums] of sorted) {
    const absPath = path.join(ROOT, relPath);
    if (!fs.existsSync(absPath)) {
      parts.push(`### ${relPath} (citato ${lineNums.length}×)\n[File non trovato sul disco]\n`);
      continue;
    }

    try {
      const content = fs.readFileSync(absPath, "utf8");
      const lines = content.split("\n");
      // Prendi la prima occorrenza di riga menzionata
      const targetLine = Math.min(...lineNums);
      const from = Math.max(0, targetLine - 11);
      const to = Math.min(lines.length - 1, targetLine + 10);
      const snippet = lines.slice(from, to + 1)
        .map((l, i) => `${from + i + 1}: ${l}`)
        .join("\n");
      parts.push(`### ${relPath} (citato ${lineNums.length}×, linea ${targetLine})\n\`\`\`\n${snippet}\n\`\`\`\n`);
    } catch {
      parts.push(`### ${relPath} (citato ${lineNums.length}×)\n[Errore lettura file]\n`);
    }
  }

  return parts.join("\n");
}

// ─── Parte 7: Git log recente ─────────────────────────────────────────────────

function collectGitLog(): string {
  try {
    const result = spawnSync(
      "git",
      ["log", "--oneline", "--name-only", "-30"],
      { cwd: ROOT, encoding: "utf8", timeout: 10_000 },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) {
      return `[git log fallito con status ${result.status}: ${result.stderr?.slice(0, 200) ?? ""}]`;
    }
    return result.stdout?.trim() || "(nessun commit)";
  } catch (err) {
    return `[git non disponibile: ${String(err).slice(0, 200)}]`;
  }
}

// ─── Parte 10: Report Horus precedente ───────────────────────────────────────

/**
 * Legge l'ultimo report di triage Horus salvato in `logs/`, in `HORUS_LOG_DIR`
 * (se impostato) o in `/tmp`, e ne estrae le sezioni "PROBLEMI TROVATI" e
 * "TASK PROPOSTI" per evitare che Horus riproponga gli stessi task del round
 * precedente.
 *
 * Quando il triage viene eseguito dalla planner shell di Replit con
 * HORUS_LOG_DIR=/tmp, i report finiscono in /tmp anziché in logs/ e la ricerca
 * limitata a logs/ farebbe sempre trovare zero precedenti. Questa funzione
 * scansiona tutte e tre le posizioni candidate (deduplicando) e seleziona il
 * file più recente in assoluto.
 */
function collectPreviousHorusReport(): string | null {
  // Raccogli le directory candidate (senza duplicati)
  const candidateDirs: string[] = [path.join(ROOT, "logs")];
  const horusLogDir = process.env.HORUS_LOG_DIR?.trim();
  if (horusLogDir) {
    const resolved = path.resolve(horusLogDir);
    if (!candidateDirs.includes(resolved)) candidateDirs.push(resolved);
  }
  if (!candidateDirs.includes("/tmp")) candidateDirs.push("/tmp");

  // Raccogli tutti i file candidati da tutte le directory, con percorso assoluto
  const FILE_RE = /^horus-(log-analysis|analysis)-.*\.md$/;
  const allFiles: Array<{ dir: string; name: string }> = [];
  for (const dir of candidateDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const names = fs.readdirSync(dir)
        .filter((f) => FILE_RE.test(f) && !f.includes("-architect"));
      for (const name of names) allFiles.push({ dir, name });
    } catch {
      // directory non leggibile: saltata
    }
  }

  if (allFiles.length === 0) return null;

  // Ordina per nome file (contiene timestamp ISO → ordinamento lessicografico = cronologico)
  allFiles.sort((a, b) => b.name.localeCompare(a.name));
  const { dir, name } = allFiles[0];
  const latest = path.join(dir, name);

  try {
    const content = fs.readFileSync(latest, "utf8");
    // Estrai le sezioni rilevanti
    const problemsMatch = content.match(/## PROBLEMI TROVATI([\s\S]*?)(?=##|$)/);
    const tasksMatch = content.match(/## TASK PROPOSTI([\s\S]*?)(?=##|$)/);
    const source = dir === path.join(ROOT, "logs") ? name : `${dir}/${name}`;
    const parts: string[] = [`[Fonte: ${source}]`];
    if (problemsMatch) parts.push(`## PROBLEMI TROVATI (round precedente)\n${problemsMatch[1].trim()}`);
    if (tasksMatch) parts.push(`## TASK PROPOSTI (round precedente)\n${tasksMatch[1].trim()}`);
    return parts.length > 1 ? parts.join("\n\n") : null;
  } catch {
    return null;
  }
}

// ─── Token budget & trim ─────────────────────────────────────────────────────

/**
 * Soglia token oltre la quale si attiva il trim automatico e il warning.
 * Configurabile via env HORUS_TOKEN_BUDGET (default 28000 = ~87% del contesto
 * qwen3:4b 32K, con margine per il system prompt e la risposta).
 */
const TOKEN_BUDGET = parseInt(process.env.HORUS_TOKEN_BUDGET ?? "28000", 10);

// estimateTokens, TRIM_SECTIONS and trimBundleToFit are imported from ./lib/horus-trim

/**
 * Secondo livello di riduzione: se il bundle è ancora sopra budget dopo il trim
 * delle sezioni a bassa priorità, ricostruisce la sezione LOG FILESYSTEM con un
 * numero ridotto di righe di coda (`REDUCED_TAIL_LINES`).
 *
 * Ritorna il bundle aggiornato e il numero di righe ridotto usato, oppure
 * `null` se il fallback non era necessario o non ha avuto effetto.
 */
function trimLogSectionToFit(
  bundle: string,
  maxTokens: number,
  originalTail: number,
): { bundle: string; reducedTail: number | null } {
  if (estimateTokens(bundle) <= maxTokens) {
    return { bundle, reducedTail: null };
  }

  const reducedTail = REDUCED_TAIL_LINES;
  if (originalTail <= reducedTail) {
    // Già al di sotto della soglia ridotta: nessun guadagno possibile.
    return { bundle, reducedTail: null };
  }

  // Ricostruisce la sezione LOG FILESYSTEM con il tail ridotto.
  const logSections = collectLogs(reducedTail);
  const missingLogs: string[] = [];
  const newLogParts: string[] = [];
  for (const { file, text } of logSections) {
    if (text == null) missingLogs.push(file);
    else newLogParts.push(fmtSection(`LOG: ${file} (ultime ${reducedTail} righe)`, text));
  }
  if (missingLogs.length > 0) {
    newLogParts.push(`\n[File mancanti/vuoti saltati: ${missingLogs.join(", ")}]\n`);
  }

  const newLogSection = `\n## LOG FILESYSTEM\n${newLogParts.join("\n")}`;

  // Sostituisce la sezione LOG FILESYSTEM esistente nel bundle.
  // La sezione termina al prossimo ## di livello 2 oppure a fine stringa.
  const replaced = bundle.replace(
    /\n## LOG FILESYSTEM\n[\s\S]*?(?=\n## COMMIT RECENTI|\n## GITHUB|\n## SENTRY|\n## SORGENTI|\n## TRIAGE|\n## RICHIESTA|$)/,
    newLogSection,
  );

  if (replaced === bundle) {
    // Sezione non trovata nel bundle: nessuna sostituzione effettuata.
    return { bundle, reducedTail: null };
  }

  return { bundle: replaced, reducedTail };
}

// ─── Assemblaggio bundle ──────────────────────────────────────────────────────

async function buildBundle(tail: number, onlyInternal: boolean): Promise<string> {
  const parts: string[] = [];
  parts.push("# TRIAGE BIKERLINK — CONTESTO AGGREGATO\n");
  parts.push(`Generato: ${new Date().toISOString()}\n`);
  parts.push(`Fonti: ${onlyInternal ? "solo interne (DB + filesystem)" : "DB + filesystem + GitHub + Sentry + repo tree + git log + stack trace resolution + report precedente"}\n`);

  // ── Struttura repo GitHub ──
  if (!onlyInternal) {
    parts.push("\n## STRUTTURA REPO GITHUB\n");
    const tree = await collectGitHubRepoTree();
    if (tree) {
      parts.push(tree + "\n");
    } else {
      parts.push("[Struttura repo non disponibile — GITHUB_TOKEN assente o API irraggiungibile]\n");
    }
  }

  // ── DB ──
  parts.push("\n## DATI DB\n");
  const dbSections = await collectDb();
  for (const s of dbSections) {
    parts.push(fmtSection(`DB: ${s.title}`, s.text));
  }

  // ── Filesystem log ──
  parts.push("\n## LOG FILESYSTEM\n");
  const logSections = collectLogs(tail);
  const missingLogs: string[] = [];
  for (const { file, text } of logSections) {
    if (text == null) missingLogs.push(file);
    else parts.push(fmtSection(`LOG: ${file} (ultime ${tail} righe)`, text));
  }
  if (missingLogs.length > 0) {
    parts.push(`\n[File mancanti/vuoti saltati: ${missingLogs.join(", ")}]\n`);
  }

  // ── Git log recente (Parte 7) ──
  parts.push("\n## COMMIT RECENTI (ultimi 30)\n");
  parts.push(collectGitLog() + "\n");

  // ── GitHub Issues + Actions ──
  if (!onlyInternal) {
    parts.push("\n## GITHUB\n");
    const ghResult = await collectGitHub();
    if (ghResult.skipped) {
      parts.push(`[GitHub saltato: ${ghResult.reason}]\n`);
    } else {
      for (const s of ghResult.sections) {
        parts.push(fmtSection(s.title, s.text));
      }
    }

    // ── Sentry ──
    parts.push("\n## SENTRY\n");
    const sentryResult = await collectSentry();
    if (sentryResult.skipped) {
      parts.push(`[Sentry saltato: ${sentryResult.reason}]\n`);
    } else {
      for (const s of sentryResult.sections) {
        parts.push(fmtSection(s.title, s.text));
      }
    }
  }

  // ── Stack trace file resolution (Parte 6) ──
  // Recupera le righe crash già raccolte dal DB per la risoluzione dei file
  {
    parts.push("\n## SORGENTI COINVOLTE NEI CRASH\n");
    try {
      const crashRows = await db.execute(sql`
        SELECT stack_trace FROM app_crash_logs
        WHERE stack_trace IS NOT NULL
        ORDER BY reported_at DESC LIMIT 60
      `);
      parts.push(resolveStackTraceFiles(crashRows.rows as unknown[]) + "\n");
    } catch {
      parts.push("[Risoluzione stack trace non riuscita]\n");
    }
  }

  // ── Report Horus precedente (Parte 10) ──
  const prevReport = collectPreviousHorusReport();
  if (prevReport) {
    parts.push("\n## TRIAGE PRECEDENTE\n");
    parts.push(prevReport + "\n");
  }

  // ── Richiesta ──
  parts.push(
    "\n## RICHIESTA A HORUS\n" +
      "Analizza tutti i dati qui sopra. Identifica i problemi reali del sistema BikerLink.\n" +
      "Dove pertinente, cita il path esatto del file coinvolto usando la struttura repo qui sopra.\n" +
      "Rispondi ESCLUSIVAMENTE con le quattro sezioni richieste nel formato specificato:\n" +
      "  ## PROBLEMI TROVATI\n" +
      "  ## ANALISI CAUSE\n" +
      "  ## CORRELAZIONI TROVATE\n" +
      "  ## TASK PROPOSTI DA HORUS\n",
  );

  return parts.join("\n");
}

// ─── Chiamata Horus ───────────────────────────────────────────────────────────

/**
 * Se la sezione "## TASK PROPOSTI DA HORUS" contiene una lista (numerata o puntata)
 * anziché una tabella markdown, la converte in tabella. Lascia invariata la sezione
 * se è già una tabella (contiene pipe `|`).
 */
// normalizeTaskSection is imported from ./lib/horus-normalize (pure, testable)

async function callHorus(
  baseUrl: string,
  model: string,
  token: string | undefined,
  systemPrompt: string,
  userContent: string,
): Promise<string> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/chat`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  Object.assign(headers, cfAccessHeaders());

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        // Task #684 — Ollama ≥0.30.11: `think` deve essere TOP-LEVEL, non dentro `options`.
        // Con options.think:true il content risulta vuoto (regression 0.30.11).
        // Con think:false top-level il modello produce output diretto in message.content.
        // Se think:true top-level, il reasoning finisce in message.thinking (content può
        // essere vuoto) → il fallback sotto recupera message.thinking in quel caso.
        think: HORUS_THINK_ENABLED,
        options: { temperature: 0.2, num_predict: HORUS_THINK_ENABLED ? 800 : 600 },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${res.statusText}${text ? ` — ${text.slice(0, 500)}` : ""}`);
    }

    interface OllamaResponse {
      message?: { role: string; content: string; thinking?: string };
      error?: string;
    }

    const data = (await res.json()) as OllamaResponse;
    if (data.error) throw new Error(`Ollama error: ${data.error}`);

    // Fallback: Ollama ≥0.30.11 con think:true mette il reasoning in message.thinking
    // e lascia message.content vuoto. Se content è assente/cortissimo, proviamo thinking.
    let raw = data.message?.content?.trim() ?? "";
    if (raw.length < 50 && data.message?.thinking) {
      console.warn("  ⚠️  [callHorus] message.content vuoto/corto — uso message.thinking come fallback (Ollama ≥0.30.11 con think=true top-level).");
      raw = data.message.thinking.trim();
    }
    if (!raw) throw new Error("Risposta vuota dal modello (né content né thinking presenti).");

    // Guard anti-CoT: se l'output contiene artefatti di chain-of-thought grezzo, fail-fast.
    const COT_MARKERS = ["Okay, let's", "let me work through", "let me tackle"];
    const foundMarker = COT_MARKERS.find((m) => raw.includes(m));
    if (foundMarker) {
      throw new Error(
        `Output contiene chain-of-thought grezzo (marker: "${foundMarker}"). ` +
        "Il modello ha prodotto reasoning non strutturato. Verificare la versione Ollama e la configurazione think:. " +
        "Impostare HORUS_THINK=0 per usare think=false (default è think=true).",
      );
    }

    return normalizeTaskSection(stripThinkBlock(raw));
  } finally {
    clearTimeout(timer);
  }
}

// ─── Pulizia file horus-*.md obsoleti ────────────────────────────────────────
// Logic extracted to scripts/lib/horus-cleanup.ts for unit testability.
// normalizeTitle, jaccardSimilarity, readMarkdownTitle imported at the top.

/**
 * Thin wrapper: delegates to the lib implementation using the canonical
 * `.local/tasks/` directory relative to ROOT.
 *
 * Ritorna il numero di file rimossi.
 */
function cleanupStaleHorusFiles(): number {
  const tasksDir = path.join(ROOT, ".local", "tasks");
  return _cleanupStaleHorusFiles(tasksDir);
}

// ─── Generazione automatica file backlog da task files ───────────────────────

/**
 * Scansiona `.local/tasks/*.md`, estrae i titoli (prima riga H1) escludendo i
 * task CANCELLED/MERGED, e scrive `.local/horus-backlog.json`.
 *
 * Viene chiamata all'avvio del triage così il file è sempre aggiornato quando
 * `fetchExistingTaskTitles()` lo legge per la deduplicazione.
 *
 * Deve essere preceduta da `cleanupStaleHorusFiles()` per escludere le proposte
 * Horus già promosse a task numerati.
 *
 * Esclude automaticamente i task CANCELLED/MERGED tramite due meccanismi gestiti
 * da `collectBacklogTitles()` in ./lib/horus-backlog.ts:
 *  1. File `scripts/data/horus-cancelled-refs.json` (versionato in git): lista di
 *     ref numerici da saltare. Rigenerato dall'agente via CodeExecution prima del
 *     triage con `queryProjectTasks({ states: ["CANCELLED", "MERGED"] })`.
 *  2. Frontmatter YAML: file `.md` con `state: cancelled` o `state: merged`
 *     vengono omessi dal backlog.
 *
 * Ritorna il numero di titoli inclusi, oppure -1 in caso di errore fatale.
 */
function generateBacklogFile(): number {
  const tasksDir = path.join(ROOT, ".local", "tasks");
  const backlogFile = BACKLOG_FILE_DEFAULT;

  let files: string[];
  try {
    if (!fs.existsSync(tasksDir)) {
      fs.mkdirSync(tasksDir, { recursive: true });
      files = [];
    } else {
      files = fs.readdirSync(tasksDir).filter((f) => f.endsWith(".md"));
    }
  } catch (err) {
    console.warn(`  ⚠️  Impossibile leggere .local/tasks/: ${(err as Error).message}`);
    return -1;
  }

  // ── Carica la lista di ref CANCELLED/MERGED dal file versionato ──
  const cancelledRefs = loadCancelledRefs();
  const cancelledRefsAge = readCancelledRefsAge();

  if (cancelledRefs.size > 0) {
    const ageNote = cancelledRefsAge ? ` (generato: ${cancelledRefsAge.slice(0, 10)})` : "";
    console.log(`  📵 Excluded refs caricati: ${cancelledRefs.size} task CANCELLED/MERGED${ageNote}`);
  } else {
    console.log(
      `  ℹ️  Nessun excluded-refs file trovato — tutti i task .md contribuiranno al backlog.\n` +
      `       Per escludere task cancellati/mergiati, rigenera scripts/data/horus-cancelled-refs.json\n` +
      `       via CodeExecution con queryProjectTasks({ states: ["CANCELLED", "MERGED"] }).`,
    );
  }

  // ── Filtra i file con i due meccanismi (ref-list + frontmatter) ──
  const { titles, skippedByRef, skippedByFrontmatter } = collectBacklogTitles(
    files,
    tasksDir,
    cancelledRefs,
  );

  const totalSkipped = skippedByRef + skippedByFrontmatter;
  if (totalSkipped > 0) {
    console.log(
      `  🚫 Task esclusi dal backlog: ${totalSkipped}` +
      (skippedByRef > 0 ? ` (${skippedByRef} per ref` : "") +
      (skippedByFrontmatter > 0
        ? `${skippedByRef > 0 ? ", " : " ("}${skippedByFrontmatter} per frontmatter)`
        : skippedByRef > 0 ? ")" : ""),
    );
  }

  try {
    fs.mkdirSync(path.dirname(backlogFile), { recursive: true });
    fs.writeFileSync(
      backlogFile,
      JSON.stringify(
        {
          titles,
          generatedAt: new Date().toISOString(),
          source: "task-files",
          fileCount: files.length,
          excludedCount: totalSkipped,
          excludedByRef: skippedByRef,
          excludedByFrontmatter: skippedByFrontmatter,
        },
        null,
        2,
      ),
      "utf8",
    );
    return titles.length;
  } catch (err) {
    console.warn(`  ⚠️  Impossibile scrivere backlog file: ${(err as Error).message}`);
    return -1;
  }
}

// ─── Recupero task esistenti (deduplicazione via file backlog) ────────────────

/**
 * Path del file backlog generato automaticamente all'avvio del triage da
 * `generateBacklogFile()`. Contiene i titoli dei task trovati in
 * `.local/tasks/*.md` così gli script possono deduplicare senza interrogare
 * la tabella interna di Replit `project_tasks` (che non esiste nel DB Postgres).
 */
/**
 * Path del file backlog. Se `HORUS_BACKLOG_DIR` è impostato, il file viene
 * scritto in quella directory (es. `/tmp` nella shell planner dove `.local/`
 * è read-only). Default: `.local/horus-backlog.json`.
 */
const BACKLOG_FILE_DEFAULT = process.env.HORUS_BACKLOG_DIR
  ? path.join(path.resolve(process.env.HORUS_BACKLOG_DIR), "horus-backlog.json")
  : path.join(ROOT, ".local", "horus-backlog.json");

function parseBacklogFileArg(): string | null {
  const i = process.argv.indexOf("--backlog-file");
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  return null;
}

async function fetchExistingTaskTitles(): Promise<string[]> {
  const backlogFile = parseBacklogFileArg() ?? BACKLOG_FILE_DEFAULT;
  if (!fs.existsSync(backlogFile)) {
    console.warn(
      `\n  ⚠️  Backlog non disponibile — deduplicazione saltata.\n` +
      `       File atteso: ${path.relative(ROOT, backlogFile)}\n` +
      `       (generato automaticamente da generateBacklogFile() all'avvio del triage)\n` +
      `       Oppure passa --backlog-file <path> per usare un file personalizzato.\n`,
    );
    return [];
  }
  try {
    const raw = fs.readFileSync(backlogFile, "utf8");
    const data = JSON.parse(raw) as { titles?: string[] } | string[];
    const titles = Array.isArray(data) ? data : ((data as { titles?: string[] }).titles ?? []);
    const filtered = titles.filter((t): t is string => typeof t === "string" && t.length > 0);
    console.log(`  📋 Backlog letto da file: ${filtered.length} task attivi.`);
    return filtered;
  } catch (err) {
    console.warn(
      `\n  ⚠️  Errore lettura backlog (${backlogFile}): ${(err as Error).message}\n` +
      `       Deduplicazione saltata.\n`,
    );
    return [];
  }
}

// ─── Architect format alert ───────────────────────────────────────────────────

/**
 * Legge il manifest `horus-tasks-pending.json` prodotto da horus-propose-tasks.ts
 * e, se `architectFormatValid === false` con una revisione architect presente,
 * emette:
 *   1. Una riga in `system_signals` con source='horus', metric='architect.format_invalid',
 *      severity='high' — così il watchdog/admin panel la mostra nel feed segnali.
 *   2. Una push notification agli admin via Expo API — così l'alert è visibile
 *      sul telefono anche senza guardare i log.
 *
 * Entrambe le operazioni sono non-fatali (errori solo loggati come warning).
 * La funzione è no-op se:
 *   - Il manifest non esiste (propose non eseguito o --no-propose)
 *   - `hasArchitectReview` è false (nessuna revisione tentata)
 *   - `architectFormatValid` è true o undefined (formato OK)
 */
export async function emitArchitectFormatAlert(): Promise<void> {
  // Replica la logica del percorso manifest di horus-propose-tasks.ts
  const manifestDir = process.env.HORUS_LOG_DIR
    ? path.resolve(process.env.HORUS_LOG_DIR)
    : path.join(ROOT, "logs");
  const manifestPath = path.join(manifestDir, "horus-tasks-pending.json");

  if (!fs.existsSync(manifestPath)) return;

  let manifest: {
    hasArchitectReview?: boolean;
    architectFormatValid?: boolean;
    reportPath?: string;
  };
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as typeof manifest;
  } catch (err) {
    console.warn(
      `  ⚠️  [architect-alert] Errore lettura manifest (non-fatal): ${(err as Error).message}\n`,
    );
    return;
  }

  // Emetti alert solo quando una revisione era stata tentata ma il formato è risultato invalido
  if (!manifest.hasArchitectReview || manifest.architectFormatValid !== false) return;

  const alertTitle = "⚠️ Horus triage: architect format invalido";
  const alertBody = "Il filtro architect è stato ignorato — i task NON sono stati filtrati.";
  const alertDetails = {
    message: "Horus architect format invalid — task filter was skipped",
    reportPath: manifest.reportPath ?? null,
    manifestPath: path.relative(ROOT, manifestPath),
  };

  console.warn("\n  🔔 ──────────────────────────────────────────────────────");
  console.warn(`  🔔 ALERT ADMIN: ${alertDetails.message}`);
  console.warn("  🔔 Emissione system_signals + push admin...");
  console.warn("  🔔 ──────────────────────────────────────────────────────\n");

  // ── 1. Inserimento system_signals ──
  try {
    await db.execute(sql`
      INSERT INTO system_signals (source, metric, severity, details)
      VALUES (
        'horus',
        'architect.format_invalid',
        'high',
        ${JSON.stringify(alertDetails)}::jsonb
      )
    `);
    console.log("  ✅ [architect-alert] system_signals 'horus/architect.format_invalid' (high) inserito.\n");
  } catch (err) {
    console.warn(
      `  ⚠️  [architect-alert] Errore inserimento system_signals (non-fatal): ${(err as Error).message}\n`,
    );
  }

  // ── 2. Push notification agli admin ──
  try {
    // Raccoglie token da push_tokens (per-app) + fallback expo_push_token legacy
    const tokenRows = await db.execute(sql`
      SELECT DISTINCT token FROM (
        SELECT pt.token
        FROM push_tokens pt
        JOIN users u ON u.id = pt.user_id
        WHERE u.role = 'admin' AND pt.app_id = 'main'
          AND pt.token IS NOT NULL AND pt.token != ''
        UNION
        SELECT u.expo_push_token AS token
        FROM users u
        WHERE u.role = 'admin'
          AND u.expo_push_token IS NOT NULL
          AND u.expo_push_token != ''
          AND u.expo_push_token LIKE 'ExponentPushToken[%'
      ) combined
    `);

    const tokens = (tokenRows.rows as Array<{ token: string }>)
      .map((r) => r.token)
      .filter((t) => typeof t === "string" && t.length > 0);

    if (tokens.length === 0) {
      console.log("  ℹ️  [architect-alert] Nessun token push admin disponibile — push saltata.\n");
      return;
    }

    const messages = tokens.map((to) => ({
      to,
      title: alertTitle,
      body: alertBody,
      sound: "default",
      data: {
        type: "system_alert",
        metric: "architect.format_invalid",
        reportPath: manifest.reportPath ?? null,
      },
      channelId: "matches",
    }));

    const resp = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(messages),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      console.warn(
        `  ⚠️  [architect-alert] Expo push API HTTP ${resp.status}: ${text.slice(0, 300)}\n`,
      );
    } else {
      console.log(`  ✅ [architect-alert] Push inviata a ${tokens.length} device admin.\n`);
    }
  } catch (err) {
    console.warn(
      `  ⚠️  [architect-alert] Errore push admin (non-fatal): ${(err as Error).message}\n`,
    );
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Accetta sia HORUS_OLLAMA_* (nomi dei secret nel progetto) sia OLLAMA_* (alias legacy)
  const baseUrl =
    process.env.HORUS_OLLAMA_URL?.trim() || process.env.OLLAMA_URL?.trim();
  const model =
    process.env.HORUS_OLLAMA_MODEL?.trim() ||
    process.env.OLLAMA_MODEL?.trim() ||
    DEFAULT_MODEL;
  const token =
    process.env.HORUS_OLLAMA_TOKEN?.trim() ||
    process.env.OLLAMA_TOKEN?.trim() ||
    undefined;
  const tail = parseTailArg();

  console.log("════════════════════════════════════════════════════════════");
  console.log("  [Horus] BikerLink — Triage AI completo");
  console.log("════════════════════════════════════════════════════════════");
  console.log(`  Modello  : ${model}`);
  console.log(`  Tail     : ${tail} righe/log`);
  console.log(`  Fonti    : ${ONLY_INTERNAL ? "solo interne (DB + filesystem)" : "DB + filesystem + GitHub + Sentry + repo tree"}`);
  if (IS_DRY_RUN) console.log("  Modalità : DRY-RUN (nessuna chiamata a Horus)");
  if (NO_PROPOSE) console.log("  Proposta : disabilitata (--no-propose)");
  console.log("");

  // ── Pulizia file horus-*.md obsoleti ──
  // Rimuove i file horus-*.md già coperti da un task numerato, così il
  // backlog non accumula titoli stantii che rendono la deduplicazione
  // eccessivamente aggressiva nelle sessioni successive.
  const cleanedCount = cleanupStaleHorusFiles();
  if (cleanedCount > 0) {
    console.log(`  🧹 Rimossi ${cleanedCount} file horus obsoleti (già promossi a task numerati).`);
  }

  // ── Generazione automatica backlog per deduplicazione ──
  // Deve avvenire PRIMA di qualsiasi chiamata a fetchExistingTaskTitles()
  // (usata sia nella revisione architect sia in horus-propose-tasks.ts).
  // cleanupStaleHorusFiles() deve essere già stata chiamata qui sopra.
  const backlogCount = generateBacklogFile();
  if (backlogCount >= 0) {
    console.log(`  📋 Backlog aggiornato: ${backlogCount} task da .local/tasks/*.md → .local/horus-backlog.json`);
  } else {
    console.log("  ⚠️  Backlog non aggiornato (errore lettura/scrittura) — deduplicazione potrebbe essere parziale.");
  }
  console.log("");

  console.log("  ⏳ Raccolta fonti...");
  let bundle = await buildBundle(tail, ONLY_INTERNAL);

  // ── Stima token e trim preventivo (primo livello: sezioni a bassa priorità) ─
  const rawTokens = estimateTokens(bundle);
  const isOverBudget = rawTokens > TOKEN_BUDGET;
  const trimResult = isOverBudget
    ? trimBundleToFit(bundle, TOKEN_BUDGET)
    : { bundle, trimmed: [] as string[] };
  bundle = trimResult.bundle;

  // ── Secondo livello: riduzione tail LOG FILESYSTEM se ancora sopra budget ──
  const logTrimResult = trimLogSectionToFit(bundle, TOKEN_BUDGET, tail);
  bundle = logTrimResult.bundle;
  const logTailReduced = logTrimResult.reducedTail;

  const finalTokens = estimateTokens(bundle);

  console.log(
    `  📊 Bundle: ${bundle.length.toLocaleString()} caratteri, ~${finalTokens.toLocaleString()} token stimati` +
      ` (budget: ${TOKEN_BUDGET.toLocaleString()})`,
  );

  if (isOverBudget) {
    console.log("");
    console.log("  ⚠️  ──────────────────────────────────────────────────────");
    console.log(
      `  ⚠️  BUNDLE SUPERA IL BUDGET TOKEN: ~${rawTokens.toLocaleString()} > ${TOKEN_BUDGET.toLocaleString()}`,
    );
    if (trimResult.trimmed.length > 0) {
      console.log("  ⚠️  Sezioni rimosse per rientrare nel budget:");
      for (const s of trimResult.trimmed) {
        console.log(`  ⚠️    — ${s}`);
      }
    }
    if (logTailReduced !== null) {
      console.log("  ⚠️  ──────────────────────────────────────────────────────");
      console.log("  ⚠️  FALLBACK LOG TAIL ATTIVATO: bundle ancora sopra budget dopo trim sezioni.");
      console.log(`  ⚠️    Tail originale : ${tail} righe`);
      console.log(`  ⚠️    Tail ridotto   : ${logTailReduced} righe (sezione LOG FILESYSTEM)`);
    }
    console.log(
      `  ⚠️  Token dopo trim: ~${finalTokens.toLocaleString()} ${finalTokens <= TOKEN_BUDGET ? "(✅ entro budget)" : "(⚠️  ANCORA SOPRA BUDGET)"}`,
    );
    if (finalTokens > TOKEN_BUDGET) {
      console.log("  ⚠️  Budget ancora non raggiunto — Horus potrebbe troncare l'analisi!");
    }
    console.log("  ⚠️  ──────────────────────────────────────────────────────");
    console.log("");
  }

  if (IS_DRY_RUN) {
    console.log("\n════════════════════════════════════════════════════════════");
    console.log("  BUNDLE DA INVIARE (dry-run — Horus NON viene chiamato)");
    console.log("════════════════════════════════════════════════════════════\n");
    console.log(bundle);
    console.log("\n════════════════════════════════════════════════════════════");
    console.log(`  Bundle: ${bundle.length.toLocaleString()} caratteri`);
    console.log(
      `  Token stimati: ~${finalTokens.toLocaleString()} / budget ${TOKEN_BUDGET.toLocaleString()} — ` +
        (finalTokens <= TOKEN_BUDGET ? "✅ ENTRO BUDGET" : "⚠️  SOPRA BUDGET"),
    );
    if (trimResult.trimmed.length > 0) {
      console.log(`  Sezioni rimosse dal trim: ${trimResult.trimmed.join(", ")}`);
    }
    if (logTailReduced !== null) {
      console.log(`  Riduzione tail LOG FILESYSTEM: ${tail} righe → ${logTailReduced} righe`);
    }
    if (isOverBudget && rawTokens !== finalTokens) {
      console.log(`  Token originali (prima del trim): ~${rawTokens.toLocaleString()}`);
    }
    console.log("════════════════════════════════════════════════════════════");
    return;
  }

  if (!baseUrl) {
    console.error(
      "\n❌ OLLAMA_URL non impostato.\n" +
        "   Imposta il secret OLLAMA_URL con l'URL di Horus (ThinkCentre) via Cloudflare Tunnel\n" +
        "   (es. https://tc.biker-link.net) e riprova.\n",
    );
    process.exitCode = 1;
    return;
  }

  console.log(`\n  ⏳ Invio a Horus (timeout ${REQUEST_TIMEOUT_MS / 1000}s, qwen3:4b impiega tipicamente 20-60s)...\n`);

  let report: string;
  try {
    report = await callHorus(baseUrl, model, token, SYSTEM_PROMPT, bundle);
  } catch (err) {
    const e = err as Error & { cause?: { code?: string } };
    const isAbort = e.name === "AbortError";
    const code = e.cause?.code;
    console.error("\n❌ Analisi non riuscita: Horus non ha risposto.");
    if (isAbort) {
      console.error(`   Timeout dopo ${REQUEST_TIMEOUT_MS / 1000}s — il modello è troppo lento o l'host non risponde.`);
    } else if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "EAI_AGAIN") {
      console.error("   Host irraggiungibile (ThinkCentre spento o Cloudflare Tunnel giù).");
    }
    console.error(`   Dettaglio: ${e.message}`);
    console.error("\n   Verifica che il ThinkCentre sia acceso, Ollama in esecuzione\n   e che l'hostname in OLLAMA_URL sia raggiungibile.\n");
    process.exitCode = 1;
    return;
  }

  // ── Salvataggio report principale ──
  // HORUS_LOG_DIR permette di scrivere in /tmp invece di logs/ quando il
  // filesystem del planner è read-only (es. shell agente Replit → exit 254).
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const outDirPrimary = process.env.HORUS_LOG_DIR
    ? path.resolve(process.env.HORUS_LOG_DIR)
    : path.join(ROOT, "logs");
  let outDir = outDirPrimary;
  let outPath = path.join(outDir, `horus-log-analysis-${ts}.md`);

  // Stampa il report su stdout PRIMA di qualsiasi write su file, così il
  // contenuto è sempre visibile anche se la scrittura fallisce.
  console.log("════════════════════════════════════════════════════════════");
  console.log("  REPORT DI TRIAGE");
  console.log("════════════════════════════════════════════════════════════\n");
  console.log(report);
  console.log("\n════════════════════════════════════════════════════════════");

  const header =
    `# Triage AI BikerLink — ${new Date().toISOString()}\n\n` +
    `- Istanza: Horus (ThinkCentre)\n` +
    `- Modello: \`${model}\`\n` +
    `- Fonti: ${ONLY_INTERNAL ? "DB + filesystem" : "DB + filesystem + GitHub + Sentry + repo tree"}\n` +
    `- Tail log: ${tail} righe\n\n` +
    `---\n\n`;

  try {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outPath, header + report + "\n", "utf8");
  } catch (err) {
    // Fallback a /tmp se la directory primaria è read-only (exit 254 del planner)
    const fallbackDir = "/tmp";
    const fallbackPath = path.join(fallbackDir, `horus-log-analysis-${ts}.md`);
    console.warn(`\n⚠️  Impossibile salvare in ${outDir}: ${(err as Error).message}`);
    try {
      fs.writeFileSync(fallbackPath, header + report + "\n", "utf8");
      outDir = fallbackDir;
      outPath = fallbackPath;
      console.warn(`   📂 Report salvato in fallback: ${outPath}`);
    } catch (err2) {
      console.warn(`   ❌ Fallback /tmp fallito: ${(err2 as Error).message}`);
    }
  }

  console.log(`  💾 Report salvato in: ${outPath}`);
  console.log("════════════════════════════════════════════════════════════");

  // ── Revisione architect (seconda chiamata a Horus) ──
  console.log("\n  ⏳ Revisione architect in corso...\n");
  let architectReview = "";
  try {
    const existingTitles = await fetchExistingTaskTitles();
    const existingList = existingTitles.length > 0
      ? existingTitles.map((t, i) => `${i + 1}. ${t}`).join("\n")
      : "(backlog non disponibile)";

    const architectInput =
      `## REPORT HORUS\n\n${report}\n\n` +
      `## TASK GIÀ NEL BACKLOG (non proporre duplicati)\n\n${existingList}`;

    architectReview = await callHorus(baseUrl, model, token, ARCHITECT_PROMPT, architectInput);

    // Stampa su stdout PRIMA di scrivere su file
    console.log("\n  📐 REVISIONE ARCHITECT");
    console.log("════════════════════════════════════════════════════════════\n");
    console.log(architectReview);

    const reviewPath = outPath.replace(".md", "-architect.md");
    try {
      fs.writeFileSync(reviewPath, `# Revisione Architect\n\n${architectReview}\n`, "utf8");
      console.log(`\n  💾 Revisione salvata in: ${reviewPath}`);
    } catch (writeErr) {
      // Fallback /tmp per la revisione architect
      const fallbackReviewPath = path.join("/tmp", `horus-log-analysis-${ts}-architect.md`);
      try {
        fs.writeFileSync(fallbackReviewPath, `# Revisione Architect\n\n${architectReview}\n`, "utf8");
        console.warn(`\n  ⚠️  Revisione salvata in fallback: ${fallbackReviewPath}`);
      } catch {
        console.warn(`\n  ⚠️  Impossibile salvare la revisione: ${(writeErr as Error).message}`);
      }
    }
  } catch (err) {
    const e = err as Error & { cause?: { code?: string } };
    const isAbort = e.name === "AbortError";
    const code = e.cause?.code;
    const isNetworkErr = code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "EAI_AGAIN";
    const isEmptyResponse = e.message === "Risposta vuota dal modello.";
    const isHttpErr = e.message.startsWith("HTTP ");

    console.warn(`\n⚠️  Revisione architect non riuscita.`);
    if (isAbort) {
      console.warn(`   Tipo errore  : TIMEOUT — il modello ha impiegato più di ${REQUEST_TIMEOUT_MS / 1000}s.`);
      console.warn(`   Causa probabile: qwen3:4b troppo lento, host sotto carico o bundle troppo grande.`);
    } else if (isNetworkErr) {
      console.warn(`   Tipo errore  : RETE (${code}) — host irraggiungibile.`);
      console.warn(`   Causa probabile: ThinkCentre spento o Cloudflare Tunnel giù.`);
    } else if (isHttpErr) {
      console.warn(`   Tipo errore  : HTTP — risposta non-200 dal server Ollama.`);
    } else if (isEmptyResponse) {
      console.warn(`   Tipo errore  : RISPOSTA VUOTA — il modello ha restituito contenuto vuoto.`);
      console.warn(`   Causa probabile: num_predict insufficiente o modello scaricato durante la chiamata.`);
    } else {
      console.warn(`   Tipo errore  : ${e.name || "SCONOSCIUTO"}`);
    }
    console.warn(`   Messaggio    : ${e.message}`);
    if (code) console.warn(`   Codice rete  : ${code}`);
    console.warn(`   Effetto      : I task verranno proposti dal report principale (senza filtro architect).\n`);
  }

  // ── Proposta formale task ──
  if (NO_PROPOSE) {
    console.log("\n  ⏭️  Proposta task saltata (--no-propose).\n");
    return;
  }

  console.log("\n  ⏳ Preparazione proposta task...\n");
  const proposeScript = path.join(__dirname, "horus-propose-tasks.ts");
  const proposeArgs = ["tsx", proposeScript, "--report", outPath];
  if (architectReview) proposeArgs.push("--has-architect-review");

  const result = spawnSync("npx", proposeArgs, {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });

  if (result.status !== 0) {
    console.warn("\n⚠️  Proposta task completata con avvisi (vedi output sopra).\n");
  }

  // Controlla il manifest prodotto da horus-propose-tasks.ts e, se
  // architectFormatValid=false, emette system_signals + push admin.
  await emitArchitectFormatAlert();
}

main().catch((err) => {
  console.error("[log-analysis-horus] Errore inatteso:", err);
  process.exitCode = 1;
});

// ─── System Prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Sei Horus, un ingegnere senior specializzato nell'architettura e nel triage del sistema BikerLink.

BikerLink è un'app mobile React Native / Expo per motociclisti (backend Express + PostgreSQL, ThinkCentre self-hosted con Ollama per AI routing e chat, Cloudflare Tunnel per l'esposizione dei servizi). Tu (Horus) sei il modello AI per il routing intelligente e il triage sul ThinkCentre. Bowie è l'assistente in-app.

Hai accesso all'intera struttura del repository GitHub di BikerLink (tutte le cartelle e sottocartelle), inclusa nella sezione "## STRUTTURA REPO GITHUB" del bundle che ricevi. Quando identifichi un problema, fai riferimento al path esatto del file coinvolto usando questa struttura. Se un problema riguarda un componente specifico (routing, auth, telemetria, AI personas, OTA, ecc.) identifica i file coinvolti dalla struttura del repo.

Il tuo compito è analizzare i dati aggregati ricevuti (log DB, log filesystem, GitHub Issues, GitHub Actions, Sentry, git log, sorgenti stack trace) e produrre un report strutturato in QUATTRO sezioni FISSE, nell'ordine esatto indicato:

## PROBLEMI TROVATI
Elenco puntato dei problemi concreti identificati nei dati. Ogni voce deve essere specifica e actionable. Includi: il sintomo osservato, da quale fonte proviene, la frequenza/gravità, e il path del file coinvolto se identificabile. Se stack_trace è presente, cita le prime 3 righe nella descrizione del problema. Se pg_stat_user_tables mostra n_dead_tup > 10000 o seq_scan > 1000 su tabelle grandi, includilo con i valori numerici esatti.

## ANALISI CAUSE
Per ciascun problema trovato, spiega la causa radice più probabile in base ai dati disponibili. Sii conciso ma preciso. Se la causa non è determinabile dai dati, dillo esplicitamente.

## CORRELAZIONI TROVATE
SEZIONE OBBLIGATORIA. Elenca esplicitamente le connessioni trovate tra sorgenti diverse:
- Crash timestamp ↔ commit recenti che toccano lo stesso file (dalla sezione COMMIT RECENTI): correla per data e path.
- Sentry issue ↔ AppSetting che abilita quella feature: identifica la chiave AppSetting coinvolta.
- Violazioni DB integrity ↔ migration mancanti o tabelle con bloat pg_stat.
- Errori maps_telemetry ↔ engine routing coinvolto.
- Se un file nei crash stack è stato modificato in un commit recente (sezione COMMIT RECENTI), segnalalo come CORRELAZIONE AD ALTA PRIORITÀ.
- Se security_blocked in ai_call_logs mostra tentativi di leak credenziali, riportalo qui con il testo esatto dell'errore.
Se non trovi correlazioni, scrivi "(nessuna correlazione identificata)".

## TASK PROPOSTI DA HORUS
DEVI usare ESATTAMENTE questo formato tabella markdown (con intestazione e separatore):

| Titolo | Priorità | Problema | Azione |
|--------|----------|---------|--------|
| [titolo breve] | alta/media/bassa | [riferimento al problema con valore letterale estratto dai dati] | [azione specifica da intraprendere] |

Esempio concreto con valori reali (NON copiare questo esempio, usalo come riferimento del livello di dettaglio richiesto):

| Titolo | Priorità | Problema | Azione |
|--------|----------|---------|--------|
| Fix crash loop al boot su Android dopo OTA 1.4.7 | alta | app_crash_logs: "Maximum update depth exceeded" in _layout.tsx (23 eventi in 2h, device Samsung SM-G991B) — commit a3f9c12 tocca lo stesso file | Aggiungere useMemo sulle screenOptions in app/(tabs)/_layout.tsx seguendo il pattern in rnav-memo-guard.md |
| Blocca incremento dead tuple su ai_call_logs | media | pg_stat_user_tables: ai_call_logs ha n_dead_tup=87432, seq_scan=1540 — nessun indice su created_at | Aggiungere indice su (created_at) e verificare VACUUM schedule per questa tabella |

NON usare liste numerate. NON usare elenchi puntati. SOLO la tabella markdown sopra.

IMPORTANTE — colonne Problema e Azione:
NON scrivere "vedi analisi" nelle colonne Problema o Azione — cita il valore letterale, la stringa di errore, il nome del file o il timestamp estratto dai dati. Task senza evidenza specifica saranno scartati dall'architect.

Regole per i task proposti:
- Proponi tutti i task necessari; meglio 15 task precisi che 5 vaghi.
- Titolo: concreto, orientato all'impatto, max 80 caratteri.
- Priorità: alta (bloccante/dati corrotti/crash frequente), media (degradazione utente), bassa (miglioramento).
- Per ogni task, cita il valore esatto (stringa errore, chiave AppSetting, score, timestamp, sha commit) estratto letteralmente dai dati. Nessun task senza evidenza.
- Non proporre task per problemi già evidentemente risolti.
- Non proporre task di manutenzione generica ("migliorare la gestione degli errori") senza una stringa di errore specifica estratta dai dati.
- Se security_blocked in ai_call_logs è presente, crea sempre un task separato ad alta priorità con il testo dell'errore esatto.
- Se trovi un file nei crash stack modificato in un commit recente, crea un task ad alta priorità citando il commit sha e il file.

Rispondi SOLO con le quattro sezioni indicate. Niente introduzioni, niente conclusioni extra. Italiano obbligatorio.`;

// ─── Architect Prompt (seconda chiamata Horus) ────────────────────────────────

const ARCHITECT_PROMPT = `Sei Horus nel ruolo di revisore architetturale. Il tuo compito è filtrare e validare la lista di task proposti da una precedente analisi di triage.

Riceverai:
1. Il report completo di triage (con problemi trovati, correlazioni e task proposti)
2. La lista dei task già presenti nel backlog del progetto

Per ogni task proposto, valuta:
(a) È un DUPLICATO di un task già nel backlog (titolo simile, stesso problema)? → SCARTA con motivazione.
(b) È troppo VAGO o non actionable? ("migliorare X", "aggiungere log", senza scope chiaro, senza un valore o stringa letterale citata dai dati)? → SCARTA con motivazione.
(c) È già RISOLTO dai dati disponibili? → SCARTA con motivazione.
(d) È VALIDO, specifico, ha almeno un valore o stringa letterale citata dai dati, e non è coperto dal backlog? → MANTIENI.

Criteri extra:
- Verifica che ogni task validato abbia almeno un valore o stringa letterale citata dai dati (stringa di errore, chiave AppSetting, score, timestamp, sha commit). Scarta i task che descrivono il problema in modo generico senza evidenza specifica.
- Preferisci task con correlazione cross-source (crash + commit + Sentry = stessa radice) a task basati su una sola sorgente.

Rispondi con ESATTAMENTE queste due sezioni, nell'ordine indicato:

## TASK VALIDATI (pronti per proposta formale)
DEVI usare ESCLUSIVAMENTE la tabella markdown seguente. NON usare liste puntate, NON usare liste numerate, NON usare testo libero — SOLO la tabella con intestazione e separatore:

| Titolo | Priorità | Motivazione |
|--------|----------|-------------|
| [titolo] | alta/media/bassa | [perché è valido, non duplicato, e quale evidenza letterale lo supporta] |

Esempio corretto (NON copiare, usa come riferimento del formato):

| Titolo | Priorità | Motivazione |
|--------|----------|-------------|
| Fix crash loop al boot dopo OTA 1.4.7 | alta | app_crash_logs: 23 eventi "Maximum update depth exceeded" — non coperto dal backlog |

Se non ci sono task da validare, scrivi la tabella con intestazione e separatore ma senza righe dati.

## TASK SCARTATI
Elenco puntato dei task esclusi con la ragione:
- [titolo]: [duplicato di "X" / troppo vago / nessuna evidenza letterale / già risolto]

IMPORTANTE: la sezione "## TASK VALIDATI" deve contenere SOLO la tabella markdown. Qualsiasi altro formato (lista puntata, lista numerata, testo descrittivo) sarà ignorato dal sistema di proposta automatica.

Sii rigoroso. Meglio pochi task buoni che molti task ridondanti. Italiano obbligatorio.`;
