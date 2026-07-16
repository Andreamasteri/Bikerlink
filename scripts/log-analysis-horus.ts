/**
 * BikerLink — Triage AI completo con Horus
 *
 * Aggrega tutte le fonti di log di BikerLink (DB interno, filesystem, GitHub
 * Issues/Actions, Sentry EU) e le invia al modello Horus (qwen3:4b sul
 * ThinkCentre via Ollama) per un'analisi AI strutturata. Il report include
 * problemi trovati, analisi cause e proposte di task che l'agente planner
 * revisionerà prima di creare formalmente.
 *
 * Uso:
 *   npx tsx scripts/log-analysis-horus.ts
 *   npx tsx scripts/log-analysis-horus.ts --only-internal   # salta GitHub e Sentry
 *   npx tsx scripts/log-analysis-horus.ts --tail 500        # più righe per log
 *   npx tsx scripts/log-analysis-horus.ts --dry-run         # mostra bundle, non chiama Horus
 *
 * Secret/env:
 *   OLLAMA_URL    — URL base di Horus (ThinkCentre) via Cloudflare Tunnel (obbligatorio)
 *   OLLAMA_MODEL  — modello da usare (default "qwen3:4b")
 *   OLLAMA_TOKEN  — opzionale, Bearer token se l'endpoint è protetto
 *   GITHUB_TOKEN  — token GitHub (fallback: DIAG_GITHUB_TOKEN)
 *   SENTRY_AUTH_TOKEN  — User Auth Token Sentry, scope project:read
 *   SENTRY_ORG         — Organization slug Sentry
 *   SENTRY_PROJECT     — Project slug Sentry
 *   SENTRY_BASE_URL    — default "https://de.sentry.io/api/0" (istanza EU)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { db } from "../server/db";
import { sql } from "drizzle-orm";
import { cfAccessHeaders } from "../server/lib/cf-access";

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
];

/** Righe finali da prendere per ogni file di log (override con --tail N). */
const DEFAULT_TAIL_LINES = 300;

/** Timeout chiamata Horus (ms). Il qwen3:4b sul ThinkCentre impiega tipicamente 20-60s. */
const REQUEST_TIMEOUT_MS = 300_000;

const DEFAULT_MODEL = "qwen3:4b";
const GITHUB_REPO = "Andreamasteri/Bikerlink";

// ─── CLI args ─────────────────────────────────────────────────────────────────

const IS_DRY_RUN = process.argv.includes("--dry-run");
const ONLY_INTERNAL = process.argv.includes("--only-internal");

function parseTailArg(): number {
  const i = process.argv.indexOf("--tail");
  if (i !== -1 && process.argv[i + 1]) {
    const n = parseInt(process.argv[i + 1], 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return DEFAULT_TAIL_LINES;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtSection(title: string, body: string): string {
  return `\n===== ${title} =====\n${body}\n`;
}

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
  return rows
    .map((r, i) => `[${i + 1}] ${JSON.stringify(r)}`)
    .join("\n");
}

// ─── Raccolta fonti DB ────────────────────────────────────────────────────────

interface DbSection {
  title: string;
  text: string;
}

async function collectDb(): Promise<DbSection[]> {
  const queries: Array<{ title: string; query: Promise<{ rows: unknown[] }> }> = [
    {
      title: "app_crash_logs (ultimi 20 crash)",
      query: db.execute(sql`
        SELECT crash_type, LEFT(COALESCE(error_message, ''), 300) AS error_message,
               reported_at, platform, app_version
        FROM app_crash_logs
        ORDER BY reported_at DESC
        LIMIT 20
      `),
    },
    {
      title: "ai_watchdog_log (ultimi 30)",
      query: db.execute(sql`
        SELECT kind, scope, status, LEFT(COALESCE(summary, ''), 300) AS summary, created_at
        FROM ai_watchdog_log
        ORDER BY created_at DESC
        LIMIT 30
      `),
    },
    {
      title: "system_signals high/critical (ultimi 30)",
      query: db.execute(sql`
        SELECT source, metric, severity, value, unit, created_at
        FROM system_signals
        WHERE severity IN ('high', 'critical')
        ORDER BY created_at DESC
        LIMIT 30
      `),
    },
    {
      title: "diagnostic_reports (ultimi 5)",
      query: db.execute(sql`
        SELECT
          LEFT(summary::text, 500) AS summary,
          LEFT(results::text, 500) AS results_preview,
          platform, app_version, run_at
        FROM diagnostic_reports
        ORDER BY run_at DESC
        LIMIT 5
      `),
    },
    {
      title: "ai_call_logs degraded/errore (ultimi 20)",
      query: db.execute(sql`
        SELECT provider, model, latency_ms, degraded, created_at
        FROM ai_call_logs
        WHERE degraded = true OR latency_ms > 10000
        ORDER BY created_at DESC
        LIMIT 20
      `),
    },
    {
      title: "ota_watchdog_reports (ultimi 5)",
      query: db.execute(sql`
        SELECT *
        FROM ota_watchdog_reports
        ORDER BY created_at DESC
        LIMIT 5
      `).catch(() => ({ rows: [] as unknown[] })),
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

interface LogSection {
  file: string;
  text: string | null;
}

function collectLogs(tail: number): LogSection[] {
  return LOG_FILES.map((f) => ({ file: f, text: readTail(f, tail) }));
}

// ─── Raccolta GitHub ──────────────────────────────────────────────────────────

interface GitHubSection {
  title: string;
  text: string;
}

async function collectGitHub(): Promise<{ sections: GitHubSection[]; skipped: boolean; reason?: string }> {
  const token =
    process.env.GITHUB_TOKEN?.trim() || process.env.DIAG_GITHUB_TOKEN?.trim();

  if (!token) {
    return {
      sections: [],
      skipped: true,
      reason: "GITHUB_TOKEN e DIAG_GITHUB_TOKEN non impostati",
    };
  }

  const headers: Record<string, string> = {
    Authorization: `token ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "BikerLink-LogAnalysis/1.0",
  };

  const sections: GitHubSection[] = [];

  // Issues con label bug
  try {
    const issuesUrl = `https://api.github.com/repos/${GITHUB_REPO}/issues?labels=bug&state=open&per_page=10`;
    const issuesRes = await fetch(issuesUrl, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (issuesRes.ok) {
      type Issue = { number: number; title: string; body?: string | null; created_at: string };
      const issues = (await issuesRes.json()) as Issue[];
      const text =
        issues.length === 0
          ? "(nessun issue aperto con label bug)"
          : issues
              .map(
                (iss) =>
                  `#${iss.number} [${iss.created_at.slice(0, 10)}] ${iss.title}\n${
                    iss.body ? "  " + iss.body.slice(0, 300).replace(/\n/g, " ") : ""
                  }`,
              )
              .join("\n\n");
      sections.push({ title: "GitHub Issues aperti (label: bug)", text });
    } else {
      sections.push({
        title: "GitHub Issues aperti (label: bug)",
        text: `[HTTP ${issuesRes.status} — impossibile recuperare issue]`,
      });
    }
  } catch (err) {
    sections.push({
      title: "GitHub Issues aperti (label: bug)",
      text: `[ERRORE: ${err instanceof Error ? err.message : String(err)}]`,
    });
  }

  // Workflow run falliti
  try {
    const runsUrl = `https://api.github.com/repos/${GITHUB_REPO}/actions/runs?status=failure&per_page=10`;
    const runsRes = await fetch(runsUrl, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (runsRes.ok) {
      type WorkflowRun = {
        id: number;
        name: string;
        head_branch: string;
        created_at: string;
        html_url: string;
        conclusion: string;
      };
      const data = (await runsRes.json()) as { workflow_runs: WorkflowRun[] };
      const runs = data.workflow_runs ?? [];
      const text =
        runs.length === 0
          ? "(nessun workflow fallito recente)"
          : runs
              .map(
                (r) =>
                  `[${r.created_at.slice(0, 16)}] ${r.name} (branch: ${r.head_branch}) — ${r.conclusion}\n  ${r.html_url}`,
              )
              .join("\n\n");
      sections.push({ title: "GitHub Actions — run falliti (ultimi 10)", text });
    } else {
      sections.push({
        title: "GitHub Actions — run falliti (ultimi 10)",
        text: `[HTTP ${runsRes.status} — impossibile recuperare workflow runs]`,
      });
    }
  } catch (err) {
    sections.push({
      title: "GitHub Actions — run falliti (ultimi 10)",
      text: `[ERRORE: ${err instanceof Error ? err.message : String(err)}]`,
    });
  }

  return { sections, skipped: false };
}

// ─── Raccolta Sentry ──────────────────────────────────────────────────────────

interface SentrySection {
  title: string;
  text: string;
}

async function collectSentry(): Promise<{ sections: SentrySection[]; skipped: boolean; reason?: string }> {
  const authToken = process.env.SENTRY_AUTH_TOKEN?.trim();
  const org = process.env.SENTRY_ORG?.trim();
  const project = process.env.SENTRY_PROJECT?.trim();
  const baseUrl =
    process.env.SENTRY_BASE_URL?.trim() || "https://de.sentry.io/api/0";

  const missing: string[] = [];
  if (!authToken) missing.push("SENTRY_AUTH_TOKEN");
  if (!org) missing.push("SENTRY_ORG");
  if (!project) missing.push("SENTRY_PROJECT");

  if (missing.length > 0) {
    return {
      sections: [],
      skipped: true,
      reason: `Secret mancanti: ${missing.join(", ")}`,
    };
  }

  const sections: SentrySection[] = [];

  try {
    const url = `${baseUrl}/projects/${org}/${project}/issues/?is_unresolved=1&limit=20`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (res.ok) {
      type SentryIssue = {
        id: string;
        title: string;
        culprit?: string;
        count: string;
        firstSeen: string;
        lastSeen: string;
        level: string;
      };
      const issues = (await res.json()) as SentryIssue[];
      const text =
        issues.length === 0
          ? "(nessun issue non risolto su Sentry)"
          : issues
              .map(
                (iss) =>
                  `[${iss.level.toUpperCase()}] ${iss.title}\n  Culprit: ${iss.culprit ?? "?"} | Count: ${iss.count} | LastSeen: ${iss.lastSeen?.slice(0, 16) ?? "?"}`,
              )
              .join("\n\n");
      sections.push({ title: "Sentry — issue non risolti (ultimi 20)", text });
    } else {
      const body = await res.text().catch(() => "");
      sections.push({
        title: "Sentry — issue non risolti",
        text: `[HTTP ${res.status} — ${body.slice(0, 300)}]`,
      });
    }
  } catch (err) {
    sections.push({
      title: "Sentry — issue non risolti",
      text: `[ERRORE: ${err instanceof Error ? err.message : String(err)}]`,
    });
  }

  return { sections, skipped: false };
}

// ─── Assemblaggio bundle ──────────────────────────────────────────────────────

async function buildBundle(tail: number, onlyInternal: boolean): Promise<string> {
  const parts: string[] = [];
  parts.push("# TRIAGE BIKERLINK — CONTESTO AGGREGATO\n");
  parts.push(`Generato: ${new Date().toISOString()}\n`);
  parts.push(`Fonti: ${onlyInternal ? "solo interne (DB + filesystem)" : "DB + filesystem + GitHub + Sentry"}\n`);

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
    if (text == null) {
      missingLogs.push(file);
    } else {
      parts.push(fmtSection(`LOG: ${file} (ultime ${tail} righe)`, text));
    }
  }
  if (missingLogs.length > 0) {
    parts.push(`\n[File mancanti/vuoti saltati: ${missingLogs.join(", ")}]\n`);
  }

  // ── GitHub ──
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

  // ── Richiesta ──
  parts.push(
    "\n## RICHIESTA A HORUS\n" +
      "Analizza tutti i dati qui sopra. Identifica i problemi reali del sistema BikerLink.\n" +
      "Rispondi ESCLUSIVAMENTE con le tre sezioni richieste nel formato specificato:\n" +
      "  ## PROBLEMI TROVATI\n" +
      "  ## ANALISI CAUSE\n" +
      "  ## TASK PROPOSTI DA HORUS\n",
  );

  return parts.join("\n");
}

// ─── Chiamata Horus ───────────────────────────────────────────────────────────

/** Rimuove tag </think> orfani (senza apertura <think>) prodotti da qwen3 con think:false. */
function stripOrphanThinkTags(text: string): string {
  return text.replace(/<\/think>/gi, "").trim();
}

async function callHorus(
  baseUrl: string,
  model: string,
  token: string | undefined,
  bundle: string,
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
        options: { temperature: 0.2, think: false },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: bundle },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `HTTP ${res.status} ${res.statusText}${text ? ` — ${text.slice(0, 500)}` : ""}`,
      );
    }

    interface OllamaResponse {
      message?: { role: string; content: string };
      error?: string;
    }

    const data = (await res.json()) as OllamaResponse;
    if (data.error) throw new Error(`Ollama error: ${data.error}`);
    const raw = data.message?.content?.trim();
    if (!raw) throw new Error("Risposta vuota dal modello.");
    return stripOrphanThinkTags(raw);
  } finally {
    clearTimeout(timer);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const baseUrl = process.env.OLLAMA_URL?.trim();
  const model = process.env.OLLAMA_MODEL?.trim() || DEFAULT_MODEL;
  const token = process.env.OLLAMA_TOKEN?.trim() || undefined;
  const tail = parseTailArg();

  console.log("════════════════════════════════════════════════════════════");
  console.log("  [Horus] BikerLink — Triage AI completo");
  console.log("════════════════════════════════════════════════════════════");
  console.log(`  Modello  : ${model}`);
  console.log(`  Tail     : ${tail} righe/log`);
  console.log(`  Fonti    : ${ONLY_INTERNAL ? "solo interne (DB + filesystem)" : "DB + filesystem + GitHub + Sentry"}`);
  if (IS_DRY_RUN) console.log("  Modalità : DRY-RUN (nessuna chiamata a Horus)");
  console.log("");

  // Raccolta fonti
  console.log("  ⏳ Raccolta fonti...");
  const bundle = await buildBundle(tail, ONLY_INTERNAL);

  // Dry-run: stampa bundle ed esci
  if (IS_DRY_RUN) {
    console.log("\n════════════════════════════════════════════════════════════");
    console.log("  BUNDLE DA INVIARE (dry-run — Horus NON viene chiamato)");
    console.log("════════════════════════════════════════════════════════════\n");
    console.log(bundle);
    console.log("\n════════════════════════════════════════════════════════════");
    console.log(`  Bundle: ${bundle.length} caratteri, ~${Math.round(bundle.length / 4)} token stimati`);
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

  console.log(
    `\n  ⏳ Invio a Horus (timeout ${REQUEST_TIMEOUT_MS / 1000}s, qwen3:4b impiega tipicamente 20-60s)...\n`,
  );

  let report: string;
  try {
    report = await callHorus(baseUrl, model, token, bundle);
  } catch (err) {
    const e = err as Error & { cause?: { code?: string } };
    const isAbort = e.name === "AbortError";
    const code = e.cause?.code;
    console.error("\n❌ Analisi non riuscita: Horus non ha risposto.");
    if (isAbort) {
      console.error(
        `   Timeout dopo ${REQUEST_TIMEOUT_MS / 1000}s — il modello è troppo lento o l'host non risponde.`,
      );
    } else if (
      code === "ECONNREFUSED" ||
      code === "ENOTFOUND" ||
      code === "EAI_AGAIN"
    ) {
      console.error(
        "   Host irraggiungibile (ThinkCentre spento o Cloudflare Tunnel giù).",
      );
    }
    console.error(`   Dettaglio: ${e.message}`);
    console.error(
      "\n   Verifica che il ThinkCentre sia acceso, Ollama in esecuzione\n" +
        "   e che l'hostname in OLLAMA_URL sia raggiungibile.\n",
    );
    process.exitCode = 1;
    return;
  }

  // Salvataggio
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(ROOT, "logs");
  const outPath = path.join(outDir, `horus-log-analysis-${ts}.md`);
  try {
    fs.mkdirSync(outDir, { recursive: true });
    const header =
      `# Triage AI BikerLink — ${new Date().toISOString()}\n\n` +
      `- Istanza: Horus (ThinkCentre)\n` +
      `- Modello: \`${model}\`\n` +
      `- Fonti: ${ONLY_INTERNAL ? "DB + filesystem" : "DB + filesystem + GitHub + Sentry"}\n` +
      `- Tail log: ${tail} righe\n\n` +
      `---\n\n`;
    fs.writeFileSync(outPath, header + report + "\n", "utf8");
  } catch (err) {
    console.warn(
      `\n⚠️  Impossibile salvare il report su file: ${(err as Error).message}`,
    );
  }

  // Stampa a console
  console.log("════════════════════════════════════════════════════════════");
  console.log("  REPORT DI TRIAGE");
  console.log("════════════════════════════════════════════════════════════\n");
  console.log(report);
  console.log("\n════════════════════════════════════════════════════════════");
  console.log(`  💾 Report salvato in: ${path.relative(ROOT, outPath)}`);
  console.log("════════════════════════════════════════════════════════════");
  console.log("\n⚠️  Le proposte di Horus NON vengono create automaticamente.");
  console.log("   Il planner revisionerà il report prima di creare i task.\n");
}

main().catch((err) => {
  console.error("[log-analysis-horus] Errore inatteso:", err);
  process.exitCode = 1;
});

// ─── System Prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Sei Horus, un ingegnere senior specializzato nell'architettura e nel triage del sistema BikerLink.

BikerLink è un'app mobile React Native / Expo per motociclisti (backend Express + PostgreSQL, ThinkCentre self-hosted con Ollama per AI routing e chat, Cloudflare Tunnel per l'esposizione dei servizi). Tu (Horus) sei il modello AI per il routing intelligente e il triage sul ThinkCentre. Bowie è l'assistente in-app.

Il tuo compito è analizzare i dati aggregati ricevuti (log DB, log filesystem, GitHub Issues, GitHub Actions, Sentry) e produrre un report strutturato in tre sezioni FISSE, nell'ordine esatto indicato:

## PROBLEMI TROVATI
Elenco puntato dei problemi concreti identificati nei dati. Ogni voce deve essere specifica e actionable. Includi: il sintomo osservato, da quale fonte proviene, la frequenza/gravità.

## ANALISI CAUSE
Per ciascun problema trovato, spiega la causa radice più probabile in base ai dati disponibili. Sii conciso ma preciso. Se la causa non è determinabile dai dati, dillo esplicitamente.

## TASK PROPOSTI DA HORUS
Tabella markdown con i task da creare per risolvere i problemi trovati:

| Titolo | Priorità | Problema | Azione |
|--------|----------|---------|--------|
| [titolo breve] | alta/media/bassa | [riferimento al problema] | [azione specifica da intraprendere] |

Regole per i task proposti:
- Titolo: concreto, orientato all'impatto, max 80 caratteri.
- Priorità: alta (bloccante/dati corrotti/crash frequente), media (degradazione utente), bassa (miglioramento).
- Non proporre task per problemi già evidentemente risolti.
- Non proporre task di manutenzione generica ("migliorare i log", "aggiungere test").
- Massimo 10 task proposti. Se ci sono più problemi, seleziona i più critici.

Rispondi SOLO con le tre sezioni indicate. Niente introduzioni, niente conclusioni extra. Italiano obbligatorio.`;
