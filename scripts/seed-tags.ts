/**
 * Task #2711 — Seed default tag categories and tags.
 *
 * Inserisce le tre categorie canoniche (musica, stile_guida, tipo_moto)
 * e un set ragionevole di tag per ciascuna.
 * Idempotente: usa INSERT ... ON CONFLICT DO NOTHING.
 *
 * Eseguire con: npx tsx scripts/seed-tags.ts
 */

import { db, pool } from "../server/db";
import { tagCategories, tags, TAG_CATEGORY_SLUGS } from "../shared/db/tags";
import { sql } from "drizzle-orm";

const CATEGORIES = [
  {
    slug: TAG_CATEGORY_SLUGS.MUSICA,
    label: "Musica",
    description: "Genere musicale preferito dal biker",
  },
  {
    slug: TAG_CATEGORY_SLUGS.STILE_GUIDA,
    label: "Stile di Guida",
    description: "Come affronta la strada e le curve",
  },
  {
    slug: TAG_CATEGORY_SLUGS.TIPO_MOTO,
    label: "Tipo di Moto",
    description: "Categoria della moto posseduta o preferita",
  },
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

async function seed() {
  console.log("[seed-tags] Avvio seed tag categories e tags...\n");

  // 1. Upsert categories
  for (const cat of CATEGORIES) {
    await db
      .insert(tagCategories)
      .values(cat)
      .onConflictDoNothing({ target: tagCategories.slug });
    console.log(`  [cat] ${cat.slug} — OK`);
  }

  // 2. Fetch inserted categories to get their IDs
  const existingCats = await db.select().from(tagCategories);
  const catBySlug = Object.fromEntries(existingCats.map((c) => [c.slug, c]));

  // 3. Upsert tags for each category
  let totalInserted = 0;
  for (const cat of CATEGORIES) {
    const category = catBySlug[cat.slug];
    if (!category) {
      console.error(`  [ERRORE] Categoria non trovata: ${cat.slug}`);
      continue;
    }

    const tagList = TAGS_BY_SLUG[cat.slug] ?? [];
    for (const tag of tagList) {
      const result = await db
        .insert(tags)
        .values({ categoryId: category.id, slug: tag.slug, label: tag.label })
        .onConflictDoNothing({ target: [tags.categoryId, tags.slug] })
        .returning({ id: tags.id });

      if (result.length > 0) {
        totalInserted++;
        console.log(`    [tag] ${cat.slug}/${tag.slug} — INSERITO`);
      } else {
        console.log(`    [tag] ${cat.slug}/${tag.slug} — già presente`);
      }
    }
  }

  // 4. Summary
  const catCount = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(tagCategories);
  const tagCount = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(tags);

  console.log(`\n[seed-tags] Completato.`);
  console.log(`  Nuovi tag inseriti: ${totalInserted}`);
  console.log(`  Categorie totali nel DB: ${catCount[0]?.c ?? 0}`);
  console.log(`  Tag totali nel DB: ${tagCount[0]?.c ?? 0}`);
}

seed()
  .catch((e) => {
    console.error("[seed-tags] Errore:", e.message);
    pool.end().finally(() => process.exit(1));
  })
  .then(() => pool.end());
