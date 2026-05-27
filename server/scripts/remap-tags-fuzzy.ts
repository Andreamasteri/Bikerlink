/**
 * Task #2518 — Remap free-text fields ai valori canonici usando interpret().
 *
 * Scansiona campi testo liberi (user_motorcycles.brand/model, users.region)
 * e per ciascun valore distinto chiama `interpret()` per ottenere il candidato
 * canonico. Logga separatamente: esatto / alias / fuzzy (con score) / non
 * mappati. Con --apply applica le riassegnazioni; senza, è dry-run.
 *
 * Uso:
 *   npx tsx server/scripts/remap-tags-fuzzy.ts            # dry-run
 *   npx tsx server/scripts/remap-tags-fuzzy.ts --apply    # esegue update
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import { users, userMotorcycles, type TextAliasCategory } from "@shared/db";
import { interpret, normalizeText } from "../text-interpreter/interpret";

type Bucket = "exact" | "alias" | "fuzzy" | "unmapped";
interface Stat {
  bucket: Bucket;
  category: TextAliasCategory;
  from: string;
  to?: string;
  score?: number;
  rows: number;
}

const apply = process.argv.includes("--apply");
const FUZZY_MIN = 0.6;

async function collectDistinct(): Promise<
  Array<{ category: TextAliasCategory; value: string; rows: number }>
> {
  const out: Array<{ category: TextAliasCategory; value: string; rows: number }> = [];

  const brands = await db
    .select({ value: userMotorcycles.brand, rows: sql<number>`count(*)::int` })
    .from(userMotorcycles)
    .groupBy(userMotorcycles.brand);
  for (const r of brands) {
    if (r.value) out.push({ category: "bike_brand", value: r.value, rows: r.rows });
  }

  const models = await db
    .select({ value: userMotorcycles.model, rows: sql<number>`count(*)::int` })
    .from(userMotorcycles)
    .groupBy(userMotorcycles.model);
  for (const r of models) {
    if (r.value) out.push({ category: "bike_model", value: r.value, rows: r.rows });
  }

  const regions = await db
    .select({ value: users.region, rows: sql<number>`count(*)::int` })
    .from(users)
    .groupBy(users.region);
  for (const r of regions) {
    if (r.value) out.push({ category: "city", value: r.value, rows: r.rows });
  }

  return out;
}

async function applyRemap(
  category: TextAliasCategory,
  from: string,
  to: string,
): Promise<number> {
  if (category === "bike_brand") {
    const res = await db
      .update(userMotorcycles)
      .set({ brand: to })
      .where(sql`${userMotorcycles.brand} = ${from}`);
    return res.rowCount ?? 0;
  }
  if (category === "bike_model") {
    const res = await db
      .update(userMotorcycles)
      .set({ model: to })
      .where(sql`${userMotorcycles.model} = ${from}`);
    return res.rowCount ?? 0;
  }
  if (category === "city") {
    const res = await db
      .update(users)
      .set({ region: to })
      .where(sql`${users.region} = ${from}`);
    return res.rowCount ?? 0;
  }
  return 0;
}

async function main() {
  console.log(`[remap-tags-fuzzy] mode = ${apply ? "APPLY" : "DRY-RUN"}`);
  const items = await collectDistinct();
  console.log(`[remap-tags-fuzzy] valori distinti da analizzare: ${items.length}`);

  const stats: Stat[] = [];
  for (const it of items) {
    const normalized = normalizeText(it.value);
    if (!normalized) {
      stats.push({ bucket: "unmapped", category: it.category, from: it.value, rows: it.rows });
      continue;
    }
    const r = await interpret(it.value, it.category, { threshold: FUZZY_MIN, limit: 1 });

    if (r.exact && normalizeText(r.exact.value) === normalized) {
      stats.push({ bucket: "exact", category: it.category, from: it.value, to: r.exact.value, rows: it.rows });
      continue;
    }
    if (r.alias) {
      stats.push({
        bucket: "alias",
        category: it.category,
        from: it.value,
        to: r.alias.value,
        score: r.alias.confidence,
        rows: it.rows,
      });
      if (apply && r.alias.value !== it.value) {
        await applyRemap(it.category, it.value, r.alias.value);
      }
      continue;
    }
    const top = r.fuzzy[0];
    if (top && top.similarity >= FUZZY_MIN) {
      stats.push({
        bucket: "fuzzy",
        category: it.category,
        from: it.value,
        to: top.value,
        score: top.similarity,
        rows: it.rows,
      });
      if (apply && top.value !== it.value) {
        await applyRemap(it.category, it.value, top.value);
      }
      continue;
    }
    stats.push({ bucket: "unmapped", category: it.category, from: it.value, rows: it.rows });
  }

  const buckets: Record<Bucket, Stat[]> = { exact: [], alias: [], fuzzy: [], unmapped: [] };
  for (const s of stats) buckets[s.bucket].push(s);

  for (const b of ["exact", "alias", "fuzzy", "unmapped"] as Bucket[]) {
    const arr = buckets[b];
    const rowsTotal = arr.reduce((a, s) => a + s.rows, 0);
    console.log(`\n=== ${b.toUpperCase()} — ${arr.length} valori (${rowsTotal} righe) ===`);
    for (const s of arr.slice(0, 50)) {
      const score = s.score !== undefined ? ` [${s.score.toFixed(3)}]` : "";
      const arrow = s.to ? ` → ${s.to}` : "";
      console.log(`  [${s.category}] ${s.from}${arrow}${score}  (rows=${s.rows})`);
    }
    if (arr.length > 50) console.log(`  ... e altri ${arr.length - 50}`);
  }

  console.log(
    `\n[remap-tags-fuzzy] done — exact=${buckets.exact.length} alias=${buckets.alias.length} fuzzy=${buckets.fuzzy.length} unmapped=${buckets.unmapped.length}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("[remap-tags-fuzzy] FATAL", err);
  process.exit(1);
});
