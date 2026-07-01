// Task #5322 — Registrazione delle "lacune di conoscenza" dell'AI.
//
// Quando una domanda utente ottiene un punteggio RAG troppo basso (nessuna
// FAQ/knowledge pertinente), la annotiamo in ai_knowledge_gaps. Serve a due cose:
//  1. Visibilità admin su cosa gli utenti chiedono e l'app non copre.
//  2. Alimentare lo scheduler LOCALE di auto-apprendimento (Ollama), che genera
//     una risposta e la reimmette nel RAG.
//
// Tutto è best-effort: NON deve mai far fallire un turno di chat. Le scritture
// passano da withBgDbSlot per non rubare connessioni al traffico utente.
import { createHash } from "crypto";
import { sql } from "drizzle-orm";
import { db } from "../../db";
import { aiKnowledgeGaps } from "@shared/db";
import { withBgDbSlot } from "../../lib/bg-db-limiter";

// Sotto questa similarità RAG la domanda è considerata "non coperta". Il RAG usa
// TF-IDF+cosine con threshold di retrieval 0.05; qui alziamo l'asticella: anche
// uno snippet debolmente pertinente (score < 0.12) conta come lacuna.
export const KNOWLEDGE_GAP_SCORE_THRESHOLD = 0.12;

// Limiti di sanità sulla domanda registrata (evita spam/junk).
const MIN_QUESTION_LEN = 8;
const MAX_QUESTION_LEN = 500;

/** Normalizza la domanda per il fingerprint di dedup (lowercase, spazi/punteggiatura collassati). */
function normalizeQuestion(q: string): string {
  return q
    .toLowerCase()
    .replace(/[^a-zà-ÿ0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fingerprintOf(q: string): string {
  return createHash("sha256").update(normalizeQuestion(q)).digest("hex").slice(0, 64);
}

/**
 * Registra (o incrementa) una lacuna di conoscenza se il punteggio RAG è basso.
 * No-op se la domanda è troppo corta/lunga o lo score supera la soglia.
 */
export async function recordKnowledgeGap(input: {
  question: string;
  topScore: number | null;
  persona?: string | null;
  sourceApp?: string | null;
}): Promise<void> {
  const q = (input.question ?? "").trim();
  if (q.length < MIN_QUESTION_LEN || q.length > MAX_QUESTION_LEN) return;
  // topScore null = RAG vuoto → è comunque una lacuna. Se c'è uno score e supera
  // la soglia, la domanda è coperta: non registrare nulla.
  if (input.topScore != null && input.topScore >= KNOWLEDGE_GAP_SCORE_THRESHOLD) return;

  const fingerprint = fingerprintOf(q);
  try {
    await withBgDbSlot(() =>
      db
        .insert(aiKnowledgeGaps)
        .values({
          fingerprint,
          question: q,
          persona: input.persona ?? null,
          sourceApp: input.sourceApp ?? null,
          topScore: input.topScore,
          occurrences: 1,
          status: "open",
        })
        .onConflictDoUpdate({
          target: aiKnowledgeGaps.fingerprint,
          set: {
            occurrences: sql`${aiKnowledgeGaps.occurrences} + 1`,
            lastSeenAt: new Date(),
            // Un aggiornamento non "riapre" una lacuna già imparata/scartata:
            // teniamo lo status corrente (gestito dall'auto-learn/admin).
            topScore: input.topScore,
          },
        }),
    );
  } catch {
    /* best-effort: le lacune non devono mai bloccare la chat */
  }
}
