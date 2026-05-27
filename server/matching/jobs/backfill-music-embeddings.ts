import pLimit from "p-limit";
import { sql } from "drizzle-orm";
import { db } from "../../db";
import { regenerateMusicTasteEmbedding } from "../../embeddings/music-text";

/**
 * Task #2516 — Backfill embedding `music_taste` per utenti già esistenti.
 *
 * Seleziona tutti gli utenti attivi reali e (per quelli che hanno tag musica
 * o `music_taste_text` valorizzato) accoda la generazione dell'embedding.
 * Idempotente: `regenerateMusicTasteEmbedding` salta utenti con source-hash
 * invariato e quelli senza testo.
 *
 * Eseguita una volta sola allo startup del matching engine (best-effort,
 * fire-and-forget). Concurrency limitata via p-limit; il rate-limit OpenAI
 * è applicato all'interno di `regenerateMusicTasteEmbedding` tramite
 * `limiters.openai`.
 */
export async function runMusicEmbeddingsBackfill(): Promise<{
  scanned: number;
  generated: number;
  skipped: number;
  cached: number;
  errors: number;
}> {
  const startedAt = Date.now();
  let scanned = 0;
  let generated = 0;
  let skipped = 0;
  let cached = 0;
  let errors = 0;

  // Utenti reali con almeno un tag musica oppure music_taste_text non vuoto,
  // esclusi quelli che hanno già un embedding `music_taste` (re-run sicuro:
  // upsertEmbedding skippa per source-hash invariato comunque).
  const rows = await db.execute<{ id: string }>(sql`
    SELECT u.id FROM users u
    LEFT JOIN user_profiles p ON p.user_id = u.id
    WHERE u.is_fake = false
      AND u.status = 'active'
      AND (
        COALESCE(p.music_taste_text, '') <> ''
        OR EXISTS (
          SELECT 1
          FROM entity_tags et
          INNER JOIN tags t ON t.id = et.tag_id
          INNER JOIN tag_categories tc ON tc.id = t.category_id
          WHERE et.entity_type = 'user'
            AND et.entity_id = u.id
            AND tc.slug = 'musica'
        )
      )
  `);

  const userIds = (rows.rows ?? []).map((r) => r.id);
  scanned = userIds.length;
  if (scanned === 0) {
    console.log("[MusicBackfill] nessun utente eleggibile, skip");
    return { scanned, generated, skipped, cached, errors };
  }

  const limit = pLimit(3);
  await Promise.all(
    userIds.map((uid) =>
      limit(async () => {
        try {
          const res = await regenerateMusicTasteEmbedding(uid);
          if (res.skipped) skipped++;
          else if (res.cached) cached++;
          else generated++;
        } catch (err) {
          errors++;
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[MusicBackfill] err user=${uid}:`, msg);
        }
      }),
    ),
  );

  const elapsed = Date.now() - startedAt;
  console.log(
    `[MusicBackfill] done in ${elapsed}ms — scanned=${scanned} generated=${generated} cached=${cached} skipped=${skipped} errors=${errors}`,
  );
  return { scanned, generated, skipped, cached, errors };
}
