// @no-split — check-auto-learn-no-cloud-ai.sh scansiona questo file e tutti i
// moduli locali (./...) che importa, ricorsivamente, per individuare import
// cloud AI vietati. Mantieni tutta la logica in questo file; usa funzioni
// helper interne invece di creare nuovi sotto-moduli locali.
//
// Task #5322 — Job di auto-apprendimento LOCALE di Bowie (step 4 + 5).
//
// Bowie, in autonomia e usando ESCLUSIVAMENTE il proprio modello Ollama locale
// (nessun costo cloud, NESSUN fallback cloud, nessun task/agente esterno tipo
// Ares/ollama-study-repo), esplora periodicamente le lacune di conoscenza reali
// (ai_knowledge_gaps) e i flussi noti dell'app in modalità STRETTAMENTE DI
// LETTURA, genera una risposta con il modello locale e la persiste in
// ai_learned_knowledge. Quelle voci vengono poi iniettate nel RAG (via `extra`),
// SENZA toccare la knowledge base statica.
//
// Hardening READ-ONLY (step 5), enforce tecnico non solo prompt:
//   • Nessun parser/esecutore di ACTION: attivo qui (il job non chiama l'agente).
//   • Le letture DB girano in transazione `READ ONLY` e passano da withBgDbSlot
//     (budget pool: bg ≤3 conn) — mai rubano connessioni al traffico utente.
//   • Le uniche scritture sono su ai_learned_knowledge (batch) + lo status della
//     lacuna appresa.
//   • Ogni voce generata è SANIFICATA (redact PII + drop se contiene secret)
//     prima di essere persistita.
//
// Robustezza (pattern watchdog): single-flight, cooldown ≥60 min, jitter,
// fingerprint/no-change skip, cap di lavoro per ciclo, skip immediato se Ollama
// locale non è raggiungibile.
import { createHash } from "crypto";
import { withJobGate } from "../coordinator/gated-job";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { aiKnowledgeGaps, aiLearnedKnowledge } from "@shared/db";
import { withBgDbSlot } from "../../lib/bg-db-limiter";
import {
  callOllamaChat,
  isOllamaConfigured,
  isOllamaReachable,
  getOllamaModelId,
} from "../../lib/ollama-client";
import { redactPII } from "../moderation/redact";
import { matchesSensitive } from "./security-filter";

// ── Parametri di robustezza ──────────────────────────────────────────────────
const FIRST_RUN_DELAY_MS = 4 * 60_000; // parte 4 min dopo READY (pool respira)
const CYCLE_MS = 6 * 60 * 60_000; // un ciclo ogni ~6h
const COOLDOWN_MS = 60 * 60_000; // cooldown minimo tra due cicli reali (≥60 min)
const MAX_GAPS_PER_CYCLE = 3; // cap di lavoro per ciclo (poche chiamate locali)
const ANSWER_NUM_PREDICT = 500; // risposte contenute
const MIN_ANSWER_LEN = 20;
const MAX_ANSWER_LEN = 1500;

let running = false; // single-flight
let lastRunAt = 0;
let cycleTimer: NodeJS.Timeout | null = null;
let totalCycles = 0;
let totalLearned = 0;
let lastError: { at: string; message: string } | null = null;

function fingerprintOf(q: string): string {
  const norm = q.toLowerCase().replace(/[^a-zà-ÿ0-9\s]/gi, " ").replace(/\s+/g, " ").trim();
  return createHash("sha256").update(norm).digest("hex").slice(0, 64);
}

/**
 * Sanifica una risposta generata prima di persisterla: redact PII e SCARTA del
 * tutto (ritorna null) se contiene qualsiasi pattern sensibile (token, secret,
 * connection string, assegnazione env). Meglio non imparare nulla che imparare
 * un segreto.
 */
function sanitizeLearned(text: string): string | null {
  const clean = redactPII(text).trim();
  if (!clean || clean.length < MIN_ANSWER_LEN) return null;
  if (matchesSensitive(clean)) return null;
  return clean.length > MAX_ANSWER_LEN ? clean.slice(0, MAX_ANSWER_LEN) : clean;
}

interface OpenGap {
  id: string;
  question: string;
  persona: string | null;
}

/**
 * Legge le lacune aperte più frequenti in una transazione READ ONLY (enforce
 * tecnico, non solo prompt). Priorità: occorrenze desc, poi visto di recente.
 */
async function readOpenGaps(limit: number): Promise<OpenGap[]> {
  return withBgDbSlot(() =>
    db.transaction(async (tx) => {
      await tx.execute(sql`SET TRANSACTION READ ONLY`);
      const rows = await tx
        .select({ id: aiKnowledgeGaps.id, question: aiKnowledgeGaps.question, persona: aiKnowledgeGaps.persona })
        .from(aiKnowledgeGaps)
        .where(eq(aiKnowledgeGaps.status, "open"))
        .orderBy(desc(aiKnowledgeGaps.occurrences), desc(aiKnowledgeGaps.lastSeenAt))
        .limit(limit);
      return rows as OpenGap[];
    }),
  );
}

/** Genera una risposta con il modello locale di Bowie (mai cloud). */
async function generateAnswerLocal(question: string): Promise<string> {
  const prompt = `Sei Bowie, l'assistente dell'app moto BikerLink. Un utente ha chiesto:

"${question}"

Rispondi in italiano in modo chiaro, corretto e CONTENUTO (max ~5 frasi), basandoti
solo su cosa sai dell'app. Se non sei sicuro, dai indicazioni generali utili senza
inventare funzioni inesistenti. NON includere dati personali, token o segreti.

RISPOSTA:`;
  return callOllamaChat(prompt, undefined, {
    persona: "bowie",
    temperature: 0.2,
    numPredict: ANSWER_NUM_PREDICT,
  });
}

/**
 * Persiste una voce appresa (upsert su fingerprint) e marca la lacuna come
 * "learned". Sono le UNICHE scritture del job; girano fuori dalla tx read-only.
 */
async function persistLearned(gap: OpenGap, answer: string, modelId: string): Promise<void> {
  const fingerprint = fingerprintOf(gap.question);
  await withBgDbSlot(async () => {
    await db
      .insert(aiLearnedKnowledge)
      .values({
        fingerprint,
        question: gap.question,
        answer,
        persona: gap.persona ?? "bowie",
        source: "auto-learn:gap",
        modelId,
      })
      .onConflictDoUpdate({
        target: aiLearnedKnowledge.fingerprint,
        set: { answer, modelId, updatedAt: new Date() },
      });
    await db
      .update(aiKnowledgeGaps)
      .set({
        status: "learned",
        resolutionNote: `auto-appreso in locale (${modelId})`,
      })
      .where(and(eq(aiKnowledgeGaps.id, gap.id), eq(aiKnowledgeGaps.status, "open")));
  });
}

/**
 * Esegue un singolo ciclo di auto-apprendimento LOCALE.
 *
 * Esportata (Task #5330) per essere testabile in isolamento: l'invariante
 * critica — il job NON deve MAI usare un provider cloud a pagamento
 * (Groq/Gemini/OpenAI), nemmeno come fallback — è ora coperta da un test
 * automatico dedicato. La sola via di generazione è `callOllamaChat` (modello
 * locale); se Ollama non è configurato o non è raggiungibile il ciclo si salta
 * SENZA alcun fallback.
 */
export async function runCycle(): Promise<void> {
  if (running) return; // single-flight
  const now = Date.now();
  if (lastRunAt > 0 && now - lastRunAt < COOLDOWN_MS) return; // cooldown ≥60min

  // Skip immediato se il modello locale non è configurato/raggiungibile:
  // NESSUN fallback cloud, mai.
  if (!isOllamaConfigured) return;
  if (!(await isOllamaReachable("bowie"))) {
    console.log("[auto-learn] Ollama locale non raggiungibile — ciclo saltato (nessun fallback cloud)");
    return;
  }

  running = true;
  lastRunAt = now;
  totalCycles++;
  try {
    const gaps = await readOpenGaps(MAX_GAPS_PER_CYCLE);
    if (gaps.length === 0) {
      console.log("[auto-learn] nessuna lacuna aperta da imparare");
      return;
    }
    const modelId = getOllamaModelId("bowie");
    let learned = 0;
    for (const gap of gaps) {
      try {
        const raw = await generateAnswerLocal(gap.question);
        const answer = sanitizeLearned(raw ?? "");
        if (!answer) {
          console.log(`[auto-learn] risposta scartata (vuota/sensibile) per lacuna ${gap.id}`);
          continue;
        }
        await persistLearned(gap, answer, modelId);
        learned++;
      } catch (gapErr) {
        console.warn(`[auto-learn] lacuna ${gap.id} fallita (non-fatale):`, (gapErr as Error).message);
      }
    }
    totalLearned += learned;
    if (learned > 0) {
      // Invalida la cache RAG delle voci apprese così i prossimi turni le vedono.
      invalidateLearnedKnowledgeCache();
      console.log(`[auto-learn] ciclo completato — ${learned}/${gaps.length} lacune apprese`);
    }
  } catch (err) {
    lastError = { at: new Date().toISOString(), message: (err as Error).message?.slice(0, 300) ?? "unknown" };
    console.warn("[auto-learn] ciclo fallito (non-fatale):", err);
  } finally {
    running = false;
  }
}

/** Avvia lo scheduler (Phase 5, non-fatale). Idempotente. */
export function startAutoLearnScheduler(): void {
  if (cycleTimer) return;
  // Jitter ±15% sul primo run per evitare la risincronizzazione tra worker.
  const jitter = (base: number) => base * (0.85 + Math.random() * 0.3);
  const gatedCycle = withJobGate("assistant-auto-learn", () => { runCycle().catch(() => {}); });
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
  console.log("[auto-learn] scheduler avviato (local-only, ciclo ~6h, cooldown ≥60min)");
}

export function stopAutoLearnScheduler(): void {
  if (cycleTimer) { clearTimeout(cycleTimer); cycleTimer = null; }
}

/**
 * Solo per i test (Task #5330): azzera lo stato interno del ciclo (single-flight,
 * cooldown, contatori) così ogni caso può partire da una tabula rasa. NON usare
 * in produzione.
 */
export function __resetAutoLearnStateForTest(): void {
  running = false;
  lastRunAt = 0;
  totalCycles = 0;
  totalLearned = 0;
  lastError = null;
}

export function getAutoLearnStats() {
  return {
    running,
    totalCycles,
    totalLearned,
    lastRunAt: lastRunAt > 0 ? new Date(lastRunAt).toISOString() : null,
    lastError,
  };
}

// ── Integrazione RAG: caricamento delle voci apprese (con cache breve) ────────
import type { KnowledgeEntry } from "./knowledge";

const LEARNED_CACHE_TTL_MS = 5 * 60_000;
let learnedCache: KnowledgeEntry[] = [];
let learnedCacheAt = 0;

export function invalidateLearnedKnowledgeCache(): void {
  learnedCacheAt = 0;
}

/**
 * Ritorna le voci auto-apprese come KnowledgeEntry[] per il parametro `extra`
 * del RAG. Cache 5 min per non colpire il DB a ogni messaggio; lettura avvolta
 * in withBgDbSlot. Best-effort: in caso di errore ritorna la cache (o []).
 */
export async function loadLearnedKnowledge(): Promise<KnowledgeEntry[]> {
  const now = Date.now();
  if (now - learnedCacheAt < LEARNED_CACHE_TTL_MS) return learnedCache;
  try {
    const rows = await withBgDbSlot(() =>
      db
        .select({ id: aiLearnedKnowledge.id, question: aiLearnedKnowledge.question, answer: aiLearnedKnowledge.answer })
        .from(aiLearnedKnowledge)
        .orderBy(desc(aiLearnedKnowledge.updatedAt))
        .limit(200),
    );
    learnedCache = rows.map((r) => ({ id: `learned:${r.id}`, question: r.question, answer: r.answer }));
    learnedCacheAt = now;
  } catch (err) {
    console.warn("[auto-learn] loadLearnedKnowledge error (uso cache):", (err as Error).message);
  }
  return learnedCache;
}
