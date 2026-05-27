/**
 * Task #2515 — Backfill bio embeddings for existing users.
 *
 * Processa tutti gli utenti con bio non vuota a batch di BATCH_SIZE.
 * Throttling globale via Bottleneck (`limiters.openai`) + concorrenza per
 * batch via p-limit. Idempotente grazie a `sourceHash` in upsertEmbedding.
 *
 * Esempio: `npx tsx scripts/backfill-bio-embeddings.ts`
 */

import pLimit from "p-limit";
import { sql } from "drizzle-orm";
import { db } from "../server/db";
import { runBioEmbeddingNow } from "../server/embeddings/bio-queue";

const BATCH_SIZE = 50;
const CONCURRENCY = 5;

type Row = { user_id: string; bio: string };

async function main() {
  const startedAt = Date.now();
  console.log("[BioBackfill] avvio...");

  const total = await db.execute<{ c: number }>(sql`
    SELECT COUNT(*)::int AS c
    FROM user_profiles up
    INNER JOIN users u ON u.id = up.user_id
    WHERE up.bio IS NOT NULL
      AND length(trim(up.bio)) > 0
      AND u.is_fake = false
  `);
  const totalCount = Number((total.rows ?? total)[0]?.c ?? 0);
  console.log(`[BioBackfill] ${totalCount} utenti con bio da processare`);

  if (totalCount === 0) {
    console.log("[BioBackfill] nessuna bio da processare, fine.");
    return;
  }

  const limit = pLimit(CONCURRENCY);
  let processed = 0;
  let cached = 0;
  let generated = 0;
  let errors = 0;
  let offset = 0;

  while (offset < totalCount) {
    const res = await db.execute<Row>(sql`
      SELECT up.user_id AS user_id, up.bio AS bio
      FROM user_profiles up
      INNER JOIN users u ON u.id = up.user_id
      WHERE up.bio IS NOT NULL
        AND length(trim(up.bio)) > 0
        AND u.is_fake = false
      ORDER BY up.user_id
      LIMIT ${BATCH_SIZE} OFFSET ${offset}
    `);
    const rows = (res.rows ?? res) as Row[];
    if (rows.length === 0) break;

    await Promise.all(
      rows.map((r) =>
        limit(async () => {
          try {
            const result = await runBioEmbeddingNow(r.user_id, r.bio);
            if (!result) return;
            if (result.cached) cached++;
            else generated++;
          } catch (err) {
            errors++;
            console.error(`[BioBackfill] errore user ${r.user_id}:`, err);
          } finally {
            processed++;
          }
        }),
      ),
    );

    const pct = ((processed / totalCount) * 100).toFixed(1);
    console.log(
      `[BioBackfill] ${processed}/${totalCount} (${pct}%) — generated=${generated} cached=${cached} errors=${errors}`,
    );
    offset += rows.length;
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `[BioBackfill] FINE in ${elapsed}s — generated=${generated} cached=${cached} errors=${errors}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[BioBackfill] FATAL:", err);
    process.exit(1);
  });
