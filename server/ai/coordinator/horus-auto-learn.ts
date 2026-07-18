// Horus Coordinator Auto-Learn (ex Quebracho Auto-Learn — Task #591).
//
// Analizza i finding dei guard (ai_watchdog_log, kind="alert") per riconoscere
// pattern RICORRENTI (stesso scope visto ≥ soglia volte nella finestra recente)
// e sintetizzarli in una nota "pattern noto" usando il modello Horus locale —
// mai cloud, mai scrittura fuori da ai_learned_knowledge (stessa tabella,
// persona="horus" per il coordinator-auto-learn).
//
// Nessuna azione correttiva: SOLO lettura + una scrittura di sintesi. Se
// Horus non è configurato/raggiungibile il ciclo si salta in silenzio,
// SENZA alcun fallback cloud.
import { createHash } from "crypto";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { withJobGate } from "./gated-job";
import { db } from "../../db";
import { aiWatchdogLog, aiLearnedKnowledge } from "@shared/db";
import { withBgDbSlot } from "../../lib/bg-db-limiter";
import { isOllamaConfigured, isOllamaReachable, callOllamaChat } from "../../lib/ollama-client";
import { AGENT_MODEL_DEFAULTS } from "../../lib/agent-constants";
import { redactPII } from "../moderation/redact";
import { matchesSensitive } from "../assistant/security-filter";

const LOOKBACK_MS = 14 * 24 * 60 * 60_000; // 14 giorni
const MIN_OCCURRENCES = 3; // soglia perché un finding sia "ricorrente" e non rumore isolato
const MAX_PATTERNS_PER_CYCLE = 3;
const COOLDOWN_MS = 6 * 60 * 60_000; // ≥6h tra due cicli reali
const FIRST_RUN_DELAY_MS = 10 * 60_000;
const CYCLE_MS = 6 * 60 * 60_000;
const MIN_NOTE_LEN = 15;
const MAX_NOTE_LEN = 1200;
const NOTE_NUM_PREDICT = 400;

let running = false;
let lastRunAt = 0;
let totalCycles = 0;
let totalLearned = 0;
let lastError: { at: string; message: string } | null = null;

function fingerprintOf(scope: string): string {
  return createHash("sha256").update(`horus-coordinator-pattern:${scope}`).digest("hex").slice(0, 64);
}

function sanitizeNote(text: string): string | null {
  const clean = redactPII(text).trim();
  if (!clean || clean.length < MIN_NOTE_LEN) return null;
  if (matchesSensitive(clean)) return null;
  return clean.length > MAX_NOTE_LEN ? clean.slice(0, MAX_NOTE_LEN) : clean;
}

export interface RecurringPattern {
  scope: string;
  occurrences: number;
  latestSummary: string;
}

/**
 * Legge gli scope di ai_watchdog_log (kind="alert") apparsi ≥MIN_OCCURRENCES
 * volte nella finestra recente, ordinati per frequenza.
 */
export async function readRecurringPatterns(limit: number): Promise<RecurringPattern[]> {
  const since = new Date(Date.now() - LOOKBACK_MS);
  return withBgDbSlot(async () => {
    const grouped = await db
      .select({
        scope: aiWatchdogLog.scope,
        occurrences: sql<number>`count(*)`.as("occurrences"),
      })
      .from(aiWatchdogLog)
      .where(and(eq(aiWatchdogLog.kind, "alert"), gte(aiWatchdogLog.createdAt, since)))
      .groupBy(aiWatchdogLog.scope)
      .having(sql`count(*) >= ${MIN_OCCURRENCES}`)
      .orderBy(sql`count(*) desc`)
      .limit(limit);

    const patterns: RecurringPattern[] = [];
    for (const g of grouped) {
      if (!g.scope) continue;
      const [latest] = await db
        .select({ summary: aiWatchdogLog.summary })
        .from(aiWatchdogLog)
        .where(and(eq(aiWatchdogLog.kind, "alert"), eq(aiWatchdogLog.scope, g.scope)))
        .orderBy(desc(aiWatchdogLog.createdAt))
        .limit(1);
      patterns.push({ scope: g.scope, occurrences: Number(g.occurrences), latestSummary: latest?.summary ?? "" });
    }
    return patterns;
  });
}

/** Genera la nota "pattern noto" con Horus (mai cloud). */
async function generatePatternNote(pattern: RecurringPattern): Promise<string> {
  const prompt =
    `Nell'ultimo periodo il guard "${pattern.scope}" ha segnalato ${pattern.occurrences} volte lo stesso ` +
    `tipo di problema. Ultimo dettaglio osservato: "${pattern.latestSummary}".\n\n` +
    `In massimo 3 frasi, sintetizza cosa questo pattern ricorrente indica di solito e cosa dovrebbe controllare ` +
    `l'admin PRIMA che si ripresenti. Rispondi in italiano, senza preamboli né markdown.`;
  const text = await callOllamaChat(prompt, undefined, {
    persona: "horus",
    numPredict: NOTE_NUM_PREDICT,
    temperature: 0.3,
  });
  return text ?? "";
}

async function persistPattern(pattern: RecurringPattern, note: string, modelId: string): Promise<void> {
  const fingerprint = fingerprintOf(pattern.scope);
  await withBgDbSlot(() =>
    db
      .insert(aiLearnedKnowledge)
      .values({
        fingerprint,
        question: `Pattern ricorrente coordinator: ${pattern.scope}`,
        answer: note,
        persona: "horus",
        source: "horus-coordinator-auto-learn:pattern",
        modelId,
      })
      .onConflictDoUpdate({
        target: aiLearnedKnowledge.fingerprint,
        set: { answer: note, modelId, updatedAt: new Date() },
      }),
  );
}

/**
 * Esegue un singolo ciclo di autolearning. Invariante critica: mai un fallback
 * cloud — la sola via di generazione è callOllamaChat con persona="horus", e il
 * ciclo si salta se Horus non è raggiungibile.
 */
export async function runHorusAutoLearnCycle(): Promise<void> {
  if (running) return;
  const now = Date.now();
  if (lastRunAt > 0 && now - lastRunAt < COOLDOWN_MS) return;

  if (!isOllamaConfigured) return;
  if (!(await isOllamaReachable("horus"))) {
    console.log("[horus-auto-learn] Horus non raggiungibile — ciclo saltato (nessun fallback cloud)");
    return;
  }

  running = true;
  lastRunAt = now;
  totalCycles++;
  try {
    const patterns = await readRecurringPatterns(MAX_PATTERNS_PER_CYCLE);
    if (patterns.length === 0) {
      console.log("[horus-auto-learn] nessun pattern ricorrente rilevato");
      return;
    }
    const modelId = process.env.HORUS_OLLAMA_MODEL?.trim() || AGENT_MODEL_DEFAULTS.horus;
    let learned = 0;
    for (const pattern of patterns) {
      try {
        const raw = await generatePatternNote(pattern);
        const note = sanitizeNote(raw ?? "");
        if (!note) {
          console.log(`[horus-auto-learn] nota scartata (vuota/sensibile) per scope ${pattern.scope}`);
          continue;
        }
        await persistPattern(pattern, note, modelId);
        learned++;
      } catch (patternErr) {
        console.warn(`[horus-auto-learn] scope ${pattern.scope} fallito (non-fatale):`, (patternErr as Error).message);
      }
    }
    totalLearned += learned;
    if (learned > 0) {
      console.log(`[horus-auto-learn] ciclo completato — ${learned}/${patterns.length} pattern appresi`);
    }
  } catch (err) {
    lastError = { at: new Date().toISOString(), message: (err as Error).message?.slice(0, 300) ?? "unknown" };
    console.warn("[horus-auto-learn] ciclo fallito (non-fatale):", err);
  } finally {
    running = false;
  }
}

let cycleTimer: NodeJS.Timeout | null = null;

/** Avvia lo scheduler (Phase 5, non-fatale). Idempotente. Gated via canRunJob. */
export function startHorusAutoLearnScheduler(): void {
  if (cycleTimer) return;
  const jitter = (base: number) => base * (0.85 + Math.random() * 0.3);
  const gatedCycle = withJobGate("horus-coordinator-auto-learn", () => runHorusAutoLearnCycle(), { critical: false });
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
  console.log("[horus-auto-learn] scheduler avviato (local-only, ciclo ~6h, cooldown ≥6h)");
}

export function stopHorusAutoLearnScheduler(): void {
  if (cycleTimer) { clearTimeout(cycleTimer); cycleTimer = null; }
}

/** Solo per i test: azzera lo stato interno del ciclo. */
export function __resetHorusAutoLearnStateForTest(): void {
  running = false;
  lastRunAt = 0;
  totalCycles = 0;
  totalLearned = 0;
  lastError = null;
}

export function getHorusAutoLearnStats() {
  return {
    running,
    totalCycles,
    totalLearned,
    lastRunAt: lastRunAt > 0 ? new Date(lastRunAt).toISOString() : null,
    lastError,
  };
}
