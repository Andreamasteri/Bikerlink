// Task #5326 — Analisi continua autonoma di Horus (background, load-aware).
//
// In finestre di basso carico (poche persone online, via online-tracker) Horus
// esegue un ciclo di analisi in SOLA LETTURA:
//   1. Riusa gli engine ESISTENTI come fonte dati (nessuna query duplicata):
//      - db-integrity: getLatestRunSummary() + listOpenViolations() (server/ai/db-integrity/runner.ts)
//      - watchdog: getLatestSnapshot() (server/ai/watchdog/aggregator.part2.ts)
//   2. Se il fingerprint (hash dei dati sorgente) è identico all'ultimo run,
//      salta il ciclo (nessuna chiamata Ollama duplicata su dati invariati).
//   3. Genera un report con il modello LOCALE di Horus (Ollama, nessun costo
//      cloud, nessun fallback cloud — come auto-learn.ts).
//   4. Dual-write: riga in ai_analysis_runs + N righe ai_analysis_artifacts
//      (fonte di verità) E file gemello logs/horus-analysis-<ts>.md (specchio
//      leggibile per debug umano — se il file fallisce a scrivere, il DB resta
//      comunque valido, mai l'inverso).
//   5. Gli artifact "shareable" vengono iniettati nel RAG (extra) per Bowie/
//      Horus e nel prompt di Ares (vedi ares-learning.ts) — knowledge transfer
//      di sola lettura, mai un fine-tuning.
//
// Robustezza (stesso pattern di auto-learn.ts): single-flight, cooldown,
// jitter, skip se Ollama locale non raggiungibile, tutte le letture DB
// avvolte in withBgDbSlot/withBgDbConnection, sanitize (redact PII + drop
// se contiene secret) prima di persistere.
import { createHash } from "crypto";
import { withJobGate } from "../coordinator/gated-job";
import { promises as fs } from "fs";
import path from "path";
import { desc, sql } from "drizzle-orm";
import { db } from "../../db";
import { aiAnalysisRuns, aiAnalysisArtifacts } from "@shared/db";
import { withBgDbSlot } from "../../lib/bg-db-limiter";
import { callOllamaChat, isOllamaConfigured, isOllamaReachable } from "../../lib/ollama-client";
import { onlineTracker } from "../../online-tracker";
import { redactPII } from "../moderation/redact";
import { matchesSensitive } from "./security-filter";
import { getLatestRunSummary, listOpenViolations } from "../db-integrity/runner";
import { getLatestSnapshot } from "../watchdog/aggregator.part2";
import { isRoutingAiBusy } from "../ai-priority-gate";
import type { KnowledgeEntry } from "./knowledge";

// Task #108 — stesso fix già applicato a horus-scanner.ts/horus-scanner-finalize.ts
// (Task #92): `persona: "horus"` in callOllamaChat sceglie SOLO l'endpoint
// (URL/token), NON il modello — senza `model` esplicito la chiamata ricade
// silenziosamente su BOWIE_OLLAMA_MODEL (qwen3:1.7b) invece di qwen3:4b, e il
// modelId persistito mentirebbe su quale modello ha davvero generato il report.
const HORUS_MODEL_ID = process.env.HORUS_OLLAMA_MODEL?.trim() || "qwen3:4b";

// ── Parametri di robustezza ──────────────────────────────────────────────────
const FIRST_RUN_DELAY_MS = 6 * 60_000; // parte 6 min dopo READY (dopo auto-learn)
const CYCLE_MS = 2 * 60 * 60_000; // un ciclo ogni ~2h (candidato, poi load-gate decide se girare)
const COOLDOWN_MS = 90 * 60_000; // cooldown minimo tra due run reali (≥90 min)
const MAX_ONLINE_USERS_FOR_ANALYSIS = 5; // load-aware: solo finestre di basso carico
const MAX_VIOLATIONS_IN_PROMPT = 15;
const ANSWER_NUM_PREDICT = 700;
const MIN_ARTIFACT_LEN = 30;
const MAX_ARTIFACT_LEN = 4000;
const ARTIFACT_TTL_DAYS = 30;
const MIRROR_DIR = path.join(process.cwd(), "logs");

let running = false; // single-flight
let lastRunAt = 0;
let cycleTimer: NodeJS.Timeout | null = null;
let totalCycles = 0;
let totalRuns = 0;
let totalSkippedLoad = 0;
let totalSkippedRoutingBusy = 0;
let totalSkippedFingerprint = 0;
let lastError: { at: string; message: string } | null = null;
let lastFingerprint: string | null = null;

function fingerprintOf(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 64);
}

/** Sanifica il contenuto generato prima di persisterlo (stesso hardening di auto-learn). */
function sanitizeArtifact(text: string): string | null {
  const clean = redactPII(text).trim();
  if (!clean || clean.length < MIN_ARTIFACT_LEN) return null;
  if (matchesSensitive(clean)) return null;
  return clean.length > MAX_ARTIFACT_LEN ? clean.slice(0, MAX_ARTIFACT_LEN) : clean;
}

// ── Raccolta dati sorgente (SOLA LETTURA — riuso engine esistenti) ───────────

interface SourceSnapshot {
  dbIntegritySummaryText: string;
  watchdogSummaryText: string;
  fingerprint: string;
}

async function collectSourceSnapshot(): Promise<SourceSnapshot> {
  const [runSummary, violations, watchdogSnapshot] = await Promise.all([
    withBgDbSlot(() => getLatestRunSummary()).catch(() => null),
    withBgDbSlot(() => listOpenViolations(MAX_VIOLATIONS_IN_PROMPT)).catch(() => []),
    Promise.resolve(getLatestSnapshot()),
  ]);

  const dbIntegritySummaryText = runSummary
    ? `Ultimo run db-integrity (${runSummary.runAt}, salute=${runSummary.health}): ` +
      `${runSummary.violationsFound} violazioni (${runSummary.autoFixed} auto-fixed, ${runSummary.manualPending} manuali), ` +
      `check eseguiti=${runSummary.checksRun}. Violazioni aperte campione: ` +
      (violations.length > 0
        ? violations.slice(0, MAX_VIOLATIONS_IN_PROMPT).map((v) => `[${v.severity}/${v.category}] ${v.checkName} (${v.count} righe)`).join("; ")
        : "nessuna")
    : "Nessun run db-integrity disponibile.";

  const watchdogSummaryText = watchdogSnapshot
    ? `Watchdog: status=${watchdogSnapshot.status}, score=${watchdogSnapshot.score}/100, ` +
      `problemi attivi: ${watchdogSnapshot.problems.length > 0
        ? watchdogSnapshot.problems.map((p) => `[${p.severity}] ${p.title}`).join("; ")
        : "nessuno"}`
    : "Nessuno snapshot watchdog disponibile.";

  const fingerprint = fingerprintOf([
    runSummary?.id ?? "none",
    String(runSummary?.violationsFound ?? 0),
    violations.map((v) => v.hash).join(","),
    watchdogSnapshot?.status ?? "none",
    String(watchdogSnapshot?.score ?? 0),
    watchdogSnapshot?.problems.map((p) => p.id).join(",") ?? "",
  ]);

  return { dbIntegritySummaryText, watchdogSummaryText, fingerprint };
}

// ── Generazione report (modello locale Horus) ────────────────────────────────

async function generateReport(source: SourceSnapshot): Promise<string> {
  const prompt = `Sei Horus, l'AI di analisi continua della piattaforma BikerLink (app per motociclisti).
Analizza lo stato del sistema qui sotto (dati REALI, sola lettura) e produci un breve
report tecnico in italiano (max ~8 righe): 1) sintesi dello stato, 2) eventuali rischi
o pattern degni di nota, 3) UNA raccomandazione concreta se pertinente. Non inventare
dati non presenti qui sotto. Non includere segreti, token o dati personali.

STATO DB-INTEGRITY:
${source.dbIntegritySummaryText}

STATO WATCHDOG:
${source.watchdogSummaryText}

REPORT:`;
  return callOllamaChat(prompt, undefined, {
    persona: "horus",
    model: HORUS_MODEL_ID,
    temperature: 0.2,
    numPredict: ANSWER_NUM_PREDICT,
  });
}

// ── Dual-write: DB (fonte di verità) + file mirror .md ───────────────────────

async function writeMirrorFile(runId: string, title: string, content: string): Promise<string | null> {
  try {
    await fs.mkdir(MIRROR_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const filePath = path.join(MIRROR_DIR, `horus-analysis-${ts}.md`);
    const body = `# Horus — Analisi autonoma\n\nRun: ${runId}\nData: ${new Date().toISOString()}\n\n## ${title}\n\n${content}\n`;
    await fs.writeFile(filePath, body, "utf8");
    return filePath;
  } catch (err) {
    console.warn("[horus-analyzer] mirror file fallito (non-fatale, il DB resta valido):", (err as Error).message);
    return null;
  }
}

async function persistRun(
  source: SourceSnapshot,
  report: string,
  modelId: string,
  trigger: "schedule" | "manual",
): Promise<void> {
  const expiresAt = new Date(Date.now() + ARTIFACT_TTL_DAYS * 24 * 60 * 60_000);
  await withBgDbSlot(async () => {
    const [run] = await db
      .insert(aiAnalysisRuns)
      .values({
        persona: "horus",
        trigger,
        fingerprint: source.fingerprint,
        status: "completed",
        modelId,
        summary: report.slice(0, 500),
        artifactCount: 2,
      })
      .returning({ id: aiAnalysisRuns.id });

    const mirrorPath = await writeMirrorFile(run.id, "Report di analisi", report);
    const contentHash = createHash("sha256").update(report).digest("hex").slice(0, 64);

    // Artifact "shareable": può essere iniettato nel RAG di Bowie/Horus e nel
    // prompt di Ares (vedi ares-learning.ts) — knowledge transfer read-only.
    await db.insert(aiAnalysisArtifacts).values([
      {
        runId: run.id,
        kind: "db-integrity",
        title: "Stato db-integrity (Horus)",
        content: source.dbIntegritySummaryText.slice(0, MAX_ARTIFACT_LEN),
        sensitivity: "internal",
        mirrorPath,
        contentHash,
        expiresAt,
      },
      {
        runId: run.id,
        kind: "watchdog",
        title: "Report analisi autonoma",
        content: report,
        sensitivity: "shareable",
        mirrorPath,
        contentHash,
        expiresAt,
      },
    ]);
  });
}

// ── Ciclo principale ──────────────────────────────────────────────────────────

export async function runCycle(trigger: "schedule" | "manual" = "schedule"): Promise<{ ran: boolean; reason?: string }> {
  if (running) return { ran: false, reason: "già in corso (single-flight)" };
  const now = Date.now();
  if (trigger === "schedule" && lastRunAt > 0 && now - lastRunAt < COOLDOWN_MS) {
    return { ran: false, reason: "cooldown attivo" };
  }

  // Load-aware: gira solo in finestre di basso carico (Task #5326).
  if (trigger === "schedule") {
    const online = onlineTracker.countOnlineUsers();
    if (online > MAX_ONLINE_USERS_FOR_ANALYSIS) {
      totalSkippedLoad++;
      return { ran: false, reason: `carico troppo alto (${online} utenti online)` };
    }
    // Task #23 — priorità al routing: se una chiamata AI reale per la generazione
    // di percorsi è in volo, il ciclo diagnostico di background CEDE il turno
    // (stesso Ollama self-hosted, scheduler pass-through). Non cambia la cadenza:
    // riproveremo al tick successivo. Il trigger manuale ("analizza ora") non cede.
    if (isRoutingAiBusy()) {
      totalSkippedRoutingBusy++;
      return { ran: false, reason: "AI di routing prioritaria in corso — ciclo ceduto" };
    }
  }

  if (!isOllamaConfigured) return { ran: false, reason: "Ollama non configurato" };
  if (!(await isOllamaReachable("horus"))) {
    return { ran: false, reason: "Ollama locale (Horus) non raggiungibile — nessun fallback cloud" };
  }

  running = true;
  lastRunAt = now;
  totalCycles++;
  try {
    const source = await collectSourceSnapshot();

    if (trigger === "schedule" && source.fingerprint === lastFingerprint) {
      totalSkippedFingerprint++;
      console.log("[horus-analyzer] fingerprint invariato — ciclo saltato (nessun dato nuovo da analizzare)");
      return { ran: false, reason: "fingerprint invariato" };
    }

    // getOllamaModelId ignora la persona e ritorna sempre BOWIE_OLLAMA_MODEL: qui
    // registriamo il modello REALE che ha prodotto il report (Horus/qwen3:4b),
    // stesso pattern di horus-scanner-finalize.ts.
    const modelId = HORUS_MODEL_ID;
    const raw = await generateReport(source);
    const report = sanitizeArtifact(raw ?? "");
    if (!report) {
      console.log("[horus-analyzer] report scartato (vuoto/sensibile)");
      return { ran: false, reason: "report scartato dopo sanitize" };
    }

    await persistRun(source, report, modelId, trigger);
    lastFingerprint = source.fingerprint;
    totalRuns++;
    console.log(`[horus-analyzer] ciclo completato (trigger=${trigger})`);
    return { ran: true };
  } catch (err) {
    lastError = { at: new Date().toISOString(), message: (err as Error).message?.slice(0, 300) ?? "unknown" };
    console.warn("[horus-analyzer] ciclo fallito (non-fatale):", err);
    return { ran: false, reason: "errore" };
  } finally {
    running = false;
  }
}

/** Trigger manuale (es. azione admin "analizza ora"). Ignora il load-gate/cooldown. */
export async function runHorusAnalysisNow(): Promise<{ ran: boolean; reason?: string }> {
  return runCycle("manual");
}

/** Avvia lo scheduler (Phase 5, non-fatale). Idempotente. */
export function startHorusAnalysisScheduler(): void {
  if (cycleTimer) return;
  const jitter = (base: number) => base * (0.85 + Math.random() * 0.3);
  const gatedCycle = withJobGate("horus-analysis", () => { runCycle("schedule").catch(() => {}); });
  const scheduleNext = () => {
    cycleTimer = setTimeout(() => {
      void gatedCycle();
      scheduleNext();
    }, jitter(CYCLE_MS));
    cycleTimer.unref?.();
  };
  cycleTimer = setTimeout(() => {
    void gatedCycle();
    scheduleNext();
  }, jitter(FIRST_RUN_DELAY_MS));
  cycleTimer.unref?.();
  console.log("[horus-analyzer] scheduler avviato (load-aware, ciclo candidato ~2h, cooldown ≥90min)");
}

export function stopHorusAnalysisScheduler(): void {
  if (cycleTimer) { clearTimeout(cycleTimer); cycleTimer = null; }
}

/** Solo per i test: azzera lo stato del modulo (single-flight, cooldown, contatori, fingerprint). */
export function __resetHorusAnalyzerStateForTest(): void {
  running = false;
  lastRunAt = 0;
  totalCycles = 0;
  totalRuns = 0;
  totalSkippedLoad = 0;
  totalSkippedRoutingBusy = 0;
  totalSkippedFingerprint = 0;
  lastError = null;
  lastFingerprint = null;
}

export function getHorusAnalysisStats() {
  return {
    running,
    totalCycles,
    totalRuns,
    totalSkippedLoad,
    totalSkippedRoutingBusy,
    totalSkippedFingerprint,
    lastRunAt: lastRunAt > 0 ? new Date(lastRunAt).toISOString() : null,
    lastError,
  };
}

// ── Integrazione RAG: artifact "shareable" come KnowledgeEntry[] ─────────────
// Task #5326 — Knowledge sharing bidirezionale Horus↔Bowie: gli artifact
// marcati "shareable" vengono esposti qui come KnowledgeEntry[] per il
// parametro `extra` di retrieveContext (rag.ts), sia per Horus stesso (memoria
// dei propri cicli precedenti) sia per Bowie (che può citare un'analisi
// recente se pertinente). Cache breve per non colpire il DB ad ogni messaggio.
const SHARED_CACHE_TTL_MS = 5 * 60_000;
let sharedCache: KnowledgeEntry[] = [];
let sharedCacheAt = 0;

export async function loadShareableAnalysisKnowledge(): Promise<KnowledgeEntry[]> {
  const now = Date.now();
  if (now - sharedCacheAt < SHARED_CACHE_TTL_MS) return sharedCache;
  try {
    const rows = await withBgDbSlot(() =>
      db
        .select({ id: aiAnalysisArtifacts.id, title: aiAnalysisArtifacts.title, content: aiAnalysisArtifacts.content })
        .from(aiAnalysisArtifacts)
        .where(sql`sensitivity = 'shareable'`)
        .orderBy(desc(aiAnalysisArtifacts.createdAt))
        .limit(20),
    );
    sharedCache = rows.map((r) => ({
      id: `horus-analysis:${r.id}`,
      question: r.title,
      answer: r.content,
    }));
    sharedCacheAt = now;
  } catch (err) {
    console.warn("[horus-analyzer] loadShareableAnalysisKnowledge error (uso cache):", (err as Error).message);
  }
  return sharedCache;
}
