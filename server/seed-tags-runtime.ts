/**
 * Task #2713 — Runtime tag seed.
 *
 * Versione idempotente del seed delle categorie/tag, eseguita ad ogni
 * avvio del server. Garantisce che ogni nuovo deployment o reset DB
 * abbia sempre i tag canonici disponibili.
 *
 * Differenze rispetto a scripts/seed-tags.ts:
 *  - non chiude il pool (riusa quello del server)
 *  - logga solo riepiloghi (no per-tag spam)
 *  - fast-path basato sulla presenza dei canonical slugs (non sui count
 *    totali), così non skippa per errore se qualcuno ha aggiunto tag
 *    custom ma manca uno dei canonici
 *  - NON-FATALE al boot: `seedTagsAtStartup()` cattura ogni errore e non
 *    propaga mai. Su errore DB transitorio pianifica UN retry differito
 *    (vedi sotto), su errore applicativo logga. Questo evita che un DB
 *    managed lento al boot generi un'`unhandledRejection` → crash-loop
 *    (Task resilienza avvio). Per un seed forzato che propaga gli errori
 *    usare lo script standalone scripts/seed-tags.ts.
 */

import { db, withDbRetry, isTransientDbError } from "./db";
import { tagCategories, tags, TAG_CATEGORY_SLUGS } from "../shared/db/tags";
import { sql, inArray } from "drizzle-orm";

const CATEGORIES = [
  { slug: TAG_CATEGORY_SLUGS.MUSICA, label: "Musica", description: "Genere musicale preferito dal biker" },
  { slug: TAG_CATEGORY_SLUGS.STILE_GUIDA, label: "Stile di Guida", description: "Come affronta la strada e le curve" },
  { slug: TAG_CATEGORY_SLUGS.TIPO_MOTO, label: "Tipo di Moto", description: "Categoria della moto posseduta o preferita" },
];

const TAGS_BY_SLUG: Record<string, Array<{ slug: string; label: string }>> = {
  [TAG_CATEGORY_SLUGS.MUSICA]: [
    { slug: "rock", label: "Rock" },
    { slug: "hard-rock", label: "Hard Rock" },
    { slug: "metal", label: "Metal" },
    { slug: "heavy-metal", label: "Heavy Metal" },
    { slug: "classic-rock", label: "Rock Classico" },
    { slug: "blues", label: "Blues" },
    { slug: "jazz", label: "Jazz" },
    { slug: "country", label: "Country" },
    { slug: "pop", label: "Pop" },
    { slug: "hip-hop", label: "Hip-Hop" },
    { slug: "rap", label: "Rap" },
    { slug: "electronic", label: "Elettronica" },
    { slug: "house", label: "House" },
    { slug: "techno", label: "Techno" },
    { slug: "reggae", label: "Reggae" },
    { slug: "folk", label: "Folk" },
    { slug: "punk", label: "Punk" },
    { slug: "indie", label: "Indie" },
    { slug: "soul", label: "Soul" },
    { slug: "rnb", label: "R&B" },
    { slug: "classica", label: "Classica" },
    { slug: "latina", label: "Latina" },
    { slug: "nessuna-preferenza", label: "Nessuna preferenza" },
  ],
  [TAG_CATEGORY_SLUGS.STILE_GUIDA]: [
    { slug: "turistico", label: "Turistico" },
    { slug: "sportivo", label: "Sportivo" },
    { slug: "tranquillo", label: "Tranquillo" },
    { slug: "avventuroso", label: "Avventuroso" },
    { slug: "fuoristrada", label: "Fuoristrada / Trail" },
    { slug: "stradista", label: "Stradista" },
    { slug: "tourer", label: "Gran Turismo" },
    { slug: "veloce", label: "Veloce" },
    { slug: "prudente", label: "Prudente" },
    { slug: "curvy", label: "Amante delle curve" },
    { slug: "autostrada", label: "Lunghi trasferimenti" },
    { slug: "urban", label: "Urbano" },
    { slug: "misto", label: "Misto (strada + off-road)" },
  ],
  [TAG_CATEGORY_SLUGS.TIPO_MOTO]: [
    { slug: "naked", label: "Naked" },
    { slug: "sportiva", label: "Sportiva / Supersport" },
    { slug: "enduro", label: "Enduro" },
    { slug: "adventure", label: "Adventure / Maxi-Trail" },
    { slug: "custom", label: "Custom / Cruiser" },
    { slug: "chopper", label: "Chopper" },
    { slug: "tourer", label: "Tourer / Gran Turismo" },
    { slug: "scooter", label: "Scooter" },
    { slug: "cafe-racer", label: "Café Racer" },
    { slug: "scrambler", label: "Scrambler" },
    { slug: "supermoto", label: "Supermotard" },
    { slug: "trial", label: "Trial" },
    { slug: "elettrica", label: "Elettrica" },
    { slug: "sidecar", label: "Sidecar" },
    { slug: "tre-ruote", label: "Tre ruote (trike)" },
    { slug: "vintage", label: "Vintage / Oldtimer" },
    { slug: "altro", label: "Altro" },
  ],
};

const EXPECTED_CANONICAL_PAIRS = CATEGORIES.flatMap((c) =>
  (TAGS_BY_SLUG[c.slug] ?? []).map((t) => `${c.slug}/${t.slug}`)
);

/**
 * Esegue UNA passata del seed in modo idempotente. Ogni query DB è avvolta in
 * withDbRetry così un singolo blip transitorio del DB managed (timeout /
 * disconnessione) viene assorbito senza far fallire la passata. Gli errori NON
 * transitori (constraint, ecc.) o un guasto prolungato vengono propagati al
 * chiamante seedTagsAtStartup(), che li degrada (mai propaga al boot).
 */
async function runSeedTagsOnce(): Promise<void> {
  // 1. Fast-path: verifica presenza canonica (non solo count).
  const existingCats = await withDbRetry(() => db.select().from(tagCategories));
  const catBySlug = new Map(existingCats.map((c) => [c.slug, c]));

  const canonicalCatSlugs = CATEGORIES.map((c) => c.slug);
  const allCanonicalCatsPresent = canonicalCatSlugs.every((s) => catBySlug.has(s));

  if (allCanonicalCatsPresent) {
    const catIds = canonicalCatSlugs.map((s) => catBySlug.get(s)!.id);
    const existingTags = await withDbRetry(() =>
      db
        .select({ categoryId: tags.categoryId, slug: tags.slug })
        .from(tags)
        .where(inArray(tags.categoryId, catIds))
    );
    const presentPairs = new Set(
      existingTags.map((t) => {
        const cat = existingCats.find((c) => c.id === t.categoryId);
        return cat ? `${cat.slug}/${t.slug}` : "";
      })
    );
    const missingPairs = EXPECTED_CANONICAL_PAIRS.filter((p) => !presentPairs.has(p));
    if (missingPairs.length === 0) {
      console.log(
        `[seed-tags] OK — ${canonicalCatSlugs.length} categorie canoniche e ${EXPECTED_CANONICAL_PAIRS.length} tag canonici già presenti (skip)`
      );
      return;
    }
    console.log(`[seed-tags] ${missingPairs.length} tag canonici mancanti — eseguo seed (esempi: ${missingPairs.slice(0, 3).join(", ")})`);
  } else {
    const missing = canonicalCatSlugs.filter((s) => !catBySlug.has(s));
    console.log(`[seed-tags] Categorie canoniche mancanti (${missing.join(", ")}) — eseguo seed`);
  }

  // 2. Upsert categorie
  for (const cat of CATEGORIES) {
    await withDbRetry(() =>
      db.insert(tagCategories).values(cat).onConflictDoNothing({ target: tagCategories.slug })
    );
  }

  // 3. Recupera categorie aggiornate per ottenere gli ID
  const refreshedCats = await withDbRetry(() => db.select().from(tagCategories));
  const refreshedBySlug = new Map(refreshedCats.map((c) => [c.slug, c]));

  // 4. Upsert tag
  let inserted = 0;
  for (const cat of CATEGORIES) {
    const category = refreshedBySlug.get(cat.slug);
    if (!category) {
      throw new Error(`[seed-tags] categoria canonica '${cat.slug}' non trovata dopo l'upsert`);
    }
    const tagList = TAGS_BY_SLUG[cat.slug] ?? [];
    for (const tag of tagList) {
      const result = await withDbRetry(() =>
        db
          .insert(tags)
          .values({ categoryId: category.id, slug: tag.slug, label: tag.label })
          .onConflictDoNothing({ target: [tags.categoryId, tags.slug] })
          .returning({ id: tags.id })
      );
      if (result.length > 0) inserted++;
    }
  }

  // 5. Riepilogo finale
  const finalCat = (await withDbRetry(() => db.select({ c: sql<number>`count(*)::int` }).from(tagCategories)))[0]?.c ?? 0;
  const finalTag = (await withDbRetry(() => db.select({ c: sql<number>`count(*)::int` }).from(tags)))[0]?.c ?? 0;
  console.log(`[seed-tags] Done — inseriti ${inserted} nuovi tag (totale DB: ${finalCat} categorie, ${finalTag} tag)`);
}

/** Ritardo del retry differito quando il seed fallisce per blip DB al boot. */
const DEFERRED_RETRY_DELAY_MS = Number(process.env.SEED_TAGS_RETRY_DELAY_MS) || 60_000;
let deferredRetryScheduled = false;

/**
 * Pianifica UN solo retry differito del seed dopo un fallimento transitorio al
 * boot. Avvolto in async-IIFE con try/catch interno e `void`: non può MAI
 * generare una unhandledRejection (la firma di crash osservata). Idempotente:
 * un retry alla volta.
 */
function scheduleDeferredSeedRetry(): void {
  if (deferredRetryScheduled) return;
  deferredRetryScheduled = true;
  setTimeout(() => {
    void (async () => {
      try {
        console.log("[seed-tags] Retry differito del seed dopo blip DB al boot...");
        await runSeedTagsOnce();
        console.log("[seed-tags] Retry differito riuscito.");
      } catch (e) {
        console.warn("[seed-tags] Retry differito fallito (non-fatal, riproverà al prossimo boot):", e);
      } finally {
        deferredRetryScheduled = false;
      }
    })();
  }, DEFERRED_RETRY_DELAY_MS).unref?.();
}

/**
 * Entry-point di boot del seed tag. È volutamente NON-FATALE: qualsiasi errore
 * viene assorbito e degrada (log + eventuale retry differito), mai propagato.
 *
 * Perché: in produzione un blip del DB managed durante il boot generava una
 * rejection asincrona che sfuggiva al try/catch del chiamante → process.exit(1)
 * → crash-loop. Qui catturiamo TUTTO: un guasto transitorio pianifica un retry
 * differito, un guasto applicativo viene loggato come errore. Il boot prosegue.
 */
export async function seedTagsAtStartup(): Promise<void> {
  try {
    await runSeedTagsOnce();
  } catch (err) {
    if (isTransientDbError(err)) {
      console.warn(
        `[seed-tags] DB transitorio durante il seed — degrado e ritento tra ${Math.round(DEFERRED_RETRY_DELAY_MS / 1000)}s:`,
        err instanceof Error ? err.message : err
      );
      scheduleDeferredSeedRetry();
    } else {
      console.error("[seed-tags] Seed fallito (non-fatal, il boot prosegue):", err);
    }
  }
}
