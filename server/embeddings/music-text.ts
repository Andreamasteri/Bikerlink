import { and, eq } from "drizzle-orm";
import PQueue from "p-queue";
import { db } from "../db";
import {
  entityTags,
  tagCategories,
  tags,
  userProfiles,
} from "@shared/db";
import { limiters } from "../lib/throttle";
import { upsertEmbedding } from "./store";

/**
 * Task #2516 — Aggregazione testo "gusti musicali" + embedding `music_taste`.
 *
 * Concatena le label umane dei tag della categoria "musica" assegnati
 * all'utente con il testo libero `music_taste_text` del suo profilo,
 * separati da virgola. Restituisce stringa vuota se nessuna fonte è
 * presente (in quel caso il caller dovrebbe saltare l'embedding).
 */
export async function buildMusicTextForUser(userId: string): Promise<string> {
  const [tagRows, profileRow] = await Promise.all([
    db
      .select({ label: tags.label })
      .from(entityTags)
      .innerJoin(tags, eq(tags.id, entityTags.tagId))
      .innerJoin(tagCategories, and(
        eq(tagCategories.id, tags.categoryId),
        eq(tagCategories.slug, "musica"),
      ))
      .where(and(
        eq(entityTags.entityType, "user"),
        eq(entityTags.entityId, userId),
      )),
    db
      .select({ musicTasteText: userProfiles.musicTasteText })
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1),
  ]);

  const parts: string[] = [];
  const seen = new Set<string>();
  for (const r of tagRows) {
    const v = (r.label ?? "").trim();
    if (v && !seen.has(v.toLowerCase())) {
      seen.add(v.toLowerCase());
      parts.push(v);
    }
  }
  const freeText = (profileRow[0]?.musicTasteText ?? "").trim();
  if (freeText) parts.push(freeText);
  return parts.join(", ");
}

/**
 * Coda in-process (single-worker per evitare scrittura DB concorrente sullo
 * stesso utente). Le chiamate all'OpenAI passano comunque dal limiter
 * centralizzato `limiters.openai` (#2517), quindi il throughput effettivo
 * è il minimo fra concurrency=1 e quota OpenAI.
 */
const musicQueue = new PQueue({ concurrency: 4 });

export interface EnqueueResult {
  enqueued: boolean;
  reason?: string;
}

/**
 * Accoda l'aggregazione + (re)generazione embedding `music_taste` per un
 * singolo utente. Idempotente: se il source-hash combacia con quello già
 * salvato in `embeddings`, l'upsert non chiama OpenAI.
 *
 * Fire-and-forget: errori vengono loggati ma non propagati. Da chiamare
 * dopo ogni mutazione di:
 *   - tag musica (entity_type='user', categoria 'musica')
 *   - profilo utente (`music_taste_text`)
 */
export function enqueueMusicTasteEmbedding(userId: string): EnqueueResult {
  if (!userId) return { enqueued: false, reason: "missing_user_id" };
  void musicQueue.add(async () => {
    try {
      const text = await buildMusicTextForUser(userId);
      if (!text) return; // nessun tag e nessun testo libero — skip
      await limiters.openai.schedule(() =>
        upsertEmbedding("user", userId, "music_taste", text),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[music-text] enqueue err user=${userId}:`, msg);
    }
  });
  return { enqueued: true };
}

export function getMusicQueueStats(): { size: number; pending: number } {
  return { size: musicQueue.size, pending: musicQueue.pending };
}

/**
 * Versione awaitable per la backfill — utile per processi batch che
 * vogliono rate-limit + osservabilità precisa.
 */
export async function regenerateMusicTasteEmbedding(
  userId: string,
): Promise<{ skipped: boolean; cached?: boolean; reason?: string }> {
  const text = await buildMusicTextForUser(userId);
  if (!text) return { skipped: true, reason: "empty_text" };
  const res = await limiters.openai.schedule(() =>
    upsertEmbedding("user", userId, "music_taste", text),
  );
  return { skipped: false, cached: res.cached };
}
