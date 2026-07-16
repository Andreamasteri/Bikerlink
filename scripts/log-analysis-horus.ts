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
import { collectGitHub, collectSentry, collectGitHubRepoTree } from "./lib/horus-sources";

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
  return rows.map((r, i) => `[${i + 1}] ${JSON.stringify(r)}`).join("\n");
}

// ─── Raccolta fonti DB ────────────────────────────────────────────────────────

interface DbSection { title: string; text: string }

async function collectDb(): Promise<DbSection[]> {
  const queries: Array<{ title: string; query: Promise<{ rows: unknown[] }> }> = [
    {
      title: "app_crash_logs (ultimi 20 crash)",
      query: db.execute(sql`
        SELECT crash_type, LEFT(COALESCE(error_message, ''), 300) AS error_message,
               reported_at, platform, app_version
        FROM app_crash_logs ORDER BY reported_at DESC LIMIT 20
      `),
    },
    {
      title: "ai_watchdog_log (ultimi 30)",
      query: db.execute(sql`
        SELECT kind, scope, status, LEFT(COALESCE(summary, ''), 300) AS summary, created_at
        FROM ai_watchdog_log ORDER BY created_at DESC LIMIT 30
      `),
    },
    {
      title: "system_signals high/critical (ultimi 30)",
      query: db.execute(sql`
        SELECT source, metric, severity, value, unit, created_at
        FROM system_signals WHERE severity IN ('high', 'critical')
        ORDER BY created_at DESC LIMIT 30
      `),
    },
    {
      title: "diagnostic_reports (ultimi 5)",
      query: db.execute(sql`
        SELECT LEFT(summary::text, 500) AS summary, LEFT(results::text, 500) AS results_preview,
               platform, app_version, run_at
        FROM diagnostic_reports ORDER BY run_at DESC LIMIT 5
      `),
    },
    {
      title: "ai_call_logs degraded/errore (ultimi 20)",
      query: db.execute(sql`
        SELECT provider, model, latency_ms, degraded, created_at
        FROM ai_call_logs WHERE degraded = true OR latency_ms > 10000
        ORDER BY created_at DESC LIMIT 20
      `),
    },
    {
      title: "ota_watchdog_reports (ultimi 5)",
      query: db.execute(sql`
        SELECT * FROM ota_watchdog_reports ORDER BY created_at DESC LIMIT 5
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

function collectLogs(tail: number): Array<{ file: string; text: string | null }> {
  return LOG_FILES.map((f) => ({ file: f, text: readTail(f, tail) }));
}

// ─── Assemblaggio bundle ──────────────────────────────────────────────────────

async function buildBundle(tail: number, onlyInternal: boolean): Promise<string> {
  const parts: string[] = [];
  parts.push("# TRIAGE BIKERLINK — CONTESTO AGGREGATO\n");
  parts.push(`Generato: ${new Date().toISOString()}\n`);
  parts.push(`Fonti: ${onlyInternal ? "solo interne (DB + filesystem)" : "DB + filesystem + GitHub + Sentry + repo tree"}\n`);

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

  // ── Richiesta ──
  parts.push(
    "\n## RICHIESTA A HORUS\n" +
      "Analizza tutti i dati qui sopra. Identifica i problemi reali del sistema BikerLink.\n" +
      "Dove pertinente, cita il path esatto del file coinvolto usando la struttura repo qui sopra.\n" +
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

/**
 * Se la sezione "## TASK PROPOSTI DA HORUS" contiene una lista (numerata o puntata)
 * anziché una tabella markdown, la converte in tabella. Lascia invariata la sezione
 * se è già una tabella (contiene pipe `|`).
 */
function normalizeTaskSection(report: string): string {
  const TASK_HEADER = "## TASK PROPOSTI DA HORUS";
  const idx = report.indexOf(TASK_HEADER);
  if (idx === -1) return report;

  const before = report.slice(0, idx + TASK_HEADER.length);
  const after = report.slice(idx + TASK_HEADER.length);

  // Se c'è già una tabella (almeno una riga con pipe), lascia invariato
  if (/^\s*\|/m.test(after.split(/\n##/)[0])) return report;

  // Estrai righe della lista (numerate "1. testo" o puntate "- testo" o "* testo")
  const sectionBody = after.split(/\n##/)[0];
  const restAfterSection = after.slice(sectionBody.length);

  const listItemRe = /^(?:\d+\.|[-*])\s+(.+)$/;
  const rows: string[] = [];
  for (const line of sectionBody.split("\n")) {
    const m = listItemRe.exec(line.trim());
    if (m) {
      const titolo = m[1].slice(0, 80).replace(/\|/g, "—");
      rows.push(`| ${titolo} | media | vedi analisi | ${titolo} |`);
    }
  }

  if (rows.length === 0) return report; // niente da convertire

  const table =
    "\n| Titolo | Priorità | Problema | Azione |\n" +
    "|--------|----------|---------|--------|\n" +
    rows.join("\n") +
    "\n";

  return before + table + (restAfterSection ? restAfterSection : "");
}

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
        options: { temperature: 0.2, think: false },
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
      message?: { role: string; content: string };
      error?: string;
    }

    const data = (await res.json()) as OllamaResponse;
    if (data.error) throw new Error(`Ollama error: ${data.error}`);
    const raw = data.message?.content?.trim();
    if (!raw) throw new Error("Risposta vuota dal modello.");
    return normalizeTaskSection(stripOrphanThinkTags(raw));
  } finally {
    clearTimeout(timer);
  }
}

// ─── Recupero task esistenti (deduplicazione) ─────────────────────────────────

async function fetchExistingTaskTitles(): Promise<string[]> {
  try {
    const rows = await db.execute(sql`
      SELECT title FROM project_tasks
      WHERE state NOT IN ('CANCELLED', 'MERGED')
      ORDER BY created_at DESC
    `);
    return (rows.rows as Array<{ title: string }>).map((r) => r.title ?? "").filter(Boolean);
  } catch {
    return []; // tabella non accessibile: ok, deduplicazione saltata
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

  console.log("  ⏳ Raccolta fonti...");
  const bundle = await buildBundle(tail, ONLY_INTERNAL);

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
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(ROOT, "logs");
  const outPath = path.join(outDir, `horus-log-analysis-${ts}.md`);
  try {
    fs.mkdirSync(outDir, { recursive: true });
    const header =
      `# Triage AI BikerLink — ${new Date().toISOString()}\n\n` +
      `- Istanza: Horus (ThinkCentre)\n` +
      `- Modello: \`${model}\`\n` +
      `- Fonti: ${ONLY_INTERNAL ? "DB + filesystem" : "DB + filesystem + GitHub + Sentry + repo tree"}\n` +
      `- Tail log: ${tail} righe\n\n` +
      `---\n\n`;
    fs.writeFileSync(outPath, header + report + "\n", "utf8");
  } catch (err) {
    console.warn(`\n⚠️  Impossibile salvare il report su file: ${(err as Error).message}`);
  }

  console.log("════════════════════════════════════════════════════════════");
  console.log("  REPORT DI TRIAGE");
  console.log("════════════════════════════════════════════════════════════\n");
  console.log(report);
  console.log("\n════════════════════════════════════════════════════════════");
  console.log(`  💾 Report salvato in: ${path.relative(ROOT, outPath)}`);
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

    const reviewPath = outPath.replace(".md", "-architect.md");
    fs.writeFileSync(reviewPath, `# Revisione Architect\n\n${architectReview}\n`, "utf8");
    console.log("\n  📐 REVISIONE ARCHITECT");
    console.log("════════════════════════════════════════════════════════════\n");
    console.log(architectReview);
    console.log(`\n  💾 Revisione salvata in: ${path.relative(ROOT, reviewPath)}`);
  } catch (err) {
    console.warn(`\n⚠️  Revisione architect non riuscita: ${(err as Error).message}`);
    console.warn("   I task verranno proposti dal report principale.\n");
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
}

main().catch((err) => {
  console.error("[log-analysis-horus] Errore inatteso:", err);
  process.exitCode = 1;
});

// ─── System Prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Sei Horus, un ingegnere senior specializzato nell'architettura e nel triage del sistema BikerLink.

BikerLink è un'app mobile React Native / Expo per motociclisti (backend Express + PostgreSQL, ThinkCentre self-hosted con Ollama per AI routing e chat, Cloudflare Tunnel per l'esposizione dei servizi). Tu (Horus) sei il modello AI per il routing intelligente e il triage sul ThinkCentre. Bowie è l'assistente in-app.

Hai accesso all'intera struttura del repository GitHub di BikerLink (tutte le cartelle e sottocartelle), inclusa nella sezione "## STRUTTURA REPO GITHUB" del bundle che ricevi. Quando identifichi un problema, fai riferimento al path esatto del file coinvolto usando questa struttura. Se un problema riguarda un componente specifico (routing, auth, telemetria, AI personas, OTA, ecc.) identifica i file coinvolti dalla struttura del repo.

Il tuo compito è analizzare i dati aggregati ricevuti (log DB, log filesystem, GitHub Issues, GitHub Actions, Sentry) e produrre un report strutturato in tre sezioni FISSE, nell'ordine esatto indicato:

## PROBLEMI TROVATI
Elenco puntato dei problemi concreti identificati nei dati. Ogni voce deve essere specifica e actionable. Includi: il sintomo osservato, da quale fonte proviene, la frequenza/gravità, e il path del file coinvolto se identificabile dalla struttura repo.

## ANALISI CAUSE
Per ciascun problema trovato, spiega la causa radice più probabile in base ai dati disponibili. Sii conciso ma preciso. Se la causa non è determinabile dai dati, dillo esplicitamente.

## TASK PROPOSTI DA HORUS
DEVI usare ESATTAMENTE questo formato tabella markdown (con intestazione e separatore):

| Titolo | Priorità | Problema | Azione |
|--------|----------|---------|--------|
| [titolo breve] | alta/media/bassa | [riferimento al problema] | [azione specifica da intraprendere] |

NON usare liste numerate. NON usare elenchi puntati. SOLO la tabella markdown sopra.

Regole per i task proposti:
- Titolo: concreto, orientato all'impatto, max 80 caratteri.
- Priorità: alta (bloccante/dati corrotti/crash frequente), media (degradazione utente), bassa (miglioramento).
- Non proporre task per problemi già evidentemente risolti.
- Non proporre task di manutenzione generica ("migliorare i log", "aggiungere test").
- Massimo 10 task proposti. Se ci sono più problemi, seleziona i più critici.

Rispondi SOLO con le tre sezioni indicate. Niente introduzioni, niente conclusioni extra. Italiano obbligatorio.`;

// ─── Architect Prompt (seconda chiamata Horus) ────────────────────────────────

const ARCHITECT_PROMPT = `Sei Horus nel ruolo di revisore architetturale. Il tuo compito è filtrare e validare la lista di task proposti da una precedente analisi di triage.

Riceverai:
1. Il report completo di triage (con problemi trovati e task proposti)
2. La lista dei task già presenti nel backlog del progetto

Per ogni task proposto, valuta:
(a) È un DUPLICATO di un task già nel backlog (titolo simile, stesso problema)? → SCARTA con motivazione.
(b) È troppo VAGO o non actionable? ("migliorare X", "aggiungere log", senza scope chiaro) → SCARTA con motivazione.
(c) È già RISOLTO dai dati disponibili? → SCARTA con motivazione.
(d) È VALIDO, specifico e non coperto dal backlog? → MANTIENI.

Rispondi con:

## TASK VALIDATI (pronti per proposta formale)
Tabella markdown solo con i task che passano la revisione:

| Titolo | Priorità | Motivazione |
|--------|----------|-------------|
| [titolo] | alta/media/bassa | [perché è valido e non duplicato] |

## TASK SCARTATI
Elenco puntato dei task esclusi con la ragione:
- [titolo]: [duplicato di "X" / troppo vago / già risolto]

Sii rigoroso. Meglio pochi task buoni che molti task ridondanti. Italiano obbligatorio.`;
