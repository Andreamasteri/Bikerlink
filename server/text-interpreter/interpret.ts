/**
 * Text Interpreter (Task #2518).
 *
 * Pipeline tollerante a errori di battitura per categorie testuali corte
 * (tag, marche moto, città, nickname). Step:
 *  1. normalize(input)        — lowercase + unaccent + trim
 *  2. exact match             — tag con label/slug uguale al normalizzato
 *  3. alias lookup            — text_aliases (input_normalized + category)
 *  4. fuzzy via pg_trgm       — similarity() con soglia configurabile
 *  5. ranking client-side     — fast-fuzzy come tie-breaker per i top N
 *
 * Le ricerche fuzzy usano gli indici GIN trigram creati in migration 0036
 * (vedi migrations/0036_text_interpreter.sql).
 */
import { sql, eq, and, desc, ilike } from "drizzle-orm";
import { Searcher } from "fast-fuzzy";
import { db } from "../db";
import {
  tags,
  tagCategories,
  textAliases,
  users,
  userMotorcycles,
  type TextAliasCategory,
} from "@shared/db";

export interface InterpretFuzzyHit {
  id: string | null;
  value: string;
  slug?: string | null;
  similarity: number;
}

export interface InterpretResult {
  query: string;
  normalized: string;
  category: TextAliasCategory;
  exact: { id: string | null; value: string; slug?: string | null } | null;
  alias: {
    id: string | null;
    value: string;
    confidence: number;
    aliasId: string;
  } | null;
  fuzzy: InterpretFuzzyHit[];
}

const DEFAULT_THRESHOLD = 0.4;
const DEFAULT_LIMIT = 5;

/**
 * Normalizzazione speculare a SQL `normalize_text()` (migration 0036).
 * Mantenuta in JS per evitare un round-trip DB nel ranking client-side.
 */
export function normalizeText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface InterpretOptions {
  threshold?: number;
  limit?: number;
}

/**
 * Esegue l'interpretazione testuale per una categoria.
 * Per `music_tag` / `riding_style_tag` / `moto_type_tag` cerca dentro la
 * tabella `tags` (sotto la categoria mappata). Per `bike_brand`,
 * `bike_model`, `city`, `nickname` cerca nelle colonne libere.
 */
export async function interpret(
  query: string,
  category: TextAliasCategory,
  opts: InterpretOptions = {},
): Promise<InterpretResult> {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_LIMIT, 1), 20);
  const normalized = normalizeText(query);

  const result: InterpretResult = {
    query,
    normalized,
    category,
    exact: null,
    alias: null,
    fuzzy: [],
  };
  if (!normalized) return result;

  result.exact = await findExact(normalized, category);
  result.alias = await findAlias(normalized, category);
  result.fuzzy = await findFuzzy(normalized, category, threshold, limit);

  return result;
}

async function findExact(
  normalized: string,
  category: TextAliasCategory,
): Promise<InterpretResult["exact"]> {
  const tagCategorySlug = mapToTagCategorySlug(category);
  if (tagCategorySlug) {
    const rows = await db
      .select({ id: tags.id, label: tags.label, slug: tags.slug })
      .from(tags)
      .innerJoin(tagCategories, eq(tagCategories.id, tags.categoryId))
      .where(
        and(
          eq(tagCategories.slug, tagCategorySlug),
          sql`(normalize_text(${tags.label}) = ${normalized}
              OR ${tags.slug} = ${normalized})`,
        ),
      )
      .limit(1);
    const row = rows[0];
    return row ? { id: row.id, value: row.label, slug: row.slug } : null;
  }

  // Free-text categories: exact su valore canonico presente nel DB
  if (category === "bike_brand") {
    const rows = await db
      .selectDistinct({ brand: userMotorcycles.brand })
      .from(userMotorcycles)
      .where(sql`normalize_text(${userMotorcycles.brand}) = ${normalized}`)
      .limit(1);
    return rows[0] ? { id: null, value: rows[0].brand } : null;
  }
  if (category === "bike_model") {
    const rows = await db
      .selectDistinct({ model: userMotorcycles.model })
      .from(userMotorcycles)
      .where(sql`normalize_text(${userMotorcycles.model}) = ${normalized}`)
      .limit(1);
    return rows[0] ? { id: null, value: rows[0].model } : null;
  }
  if (category === "city") {
    const rows = await db
      .selectDistinct({ region: users.region })
      .from(users)
      .where(sql`normalize_text(${users.region}) = ${normalized}`)
      .limit(1);
    return rows[0]?.region ? { id: null, value: rows[0].region } : null;
  }
  if (category === "nickname") {
    const rows = await db
      .select({ id: users.id, nickname: users.nickname })
      .from(users)
      .where(sql`normalize_text(${users.nickname}) = ${normalized}`)
      .limit(1);
    return rows[0] ? { id: rows[0].id, value: rows[0].nickname } : null;
  }
  return null;
}

async function findAlias(
  normalized: string,
  category: TextAliasCategory,
): Promise<InterpretResult["alias"]> {
  const rows = await db
    .select({
      id: textAliases.id,
      targetId: textAliases.targetId,
      targetValue: textAliases.targetValue,
      confidence: textAliases.confidence,
      tagLabel: tags.label,
    })
    .from(textAliases)
    .leftJoin(tags, eq(tags.id, textAliases.targetId))
    .where(
      and(
        eq(textAliases.category, category),
        eq(textAliases.inputNormalized, normalized),
      ),
    )
    .orderBy(desc(textAliases.confidence))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const value = row.tagLabel ?? row.targetValue ?? "";
  if (!value) return null;
  return {
    id: row.targetId,
    value,
    confidence: row.confidence ?? 1,
    aliasId: row.id,
  };
}

async function findFuzzy(
  normalized: string,
  category: TextAliasCategory,
  threshold: number,
  limit: number,
): Promise<InterpretFuzzyHit[]> {
  const tagCategorySlug = mapToTagCategorySlug(category);
  let raw: Array<{ id: string | null; value: string; slug?: string | null; similarity: number }> = [];

  if (tagCategorySlug) {
    const rows = await db
      .select({
        id: tags.id,
        label: tags.label,
        slug: tags.slug,
        similarity: sql<number>`GREATEST(
          similarity(normalize_text(${tags.label}), ${normalized}),
          similarity(${tags.slug}, ${normalized})
        )`,
      })
      .from(tags)
      .innerJoin(tagCategories, eq(tagCategories.id, tags.categoryId))
      .where(
        and(
          eq(tagCategories.slug, tagCategorySlug),
          sql`(
            normalize_text(${tags.label}) % ${normalized}
            OR ${tags.slug} % ${normalized}
          )`,
        ),
      )
      .orderBy(desc(sql`GREATEST(
        similarity(normalize_text(${tags.label}), ${normalized}),
        similarity(${tags.slug}, ${normalized})
      )`))
      .limit(limit * 3);
    raw = rows.map((r) => ({ id: r.id, value: r.label, slug: r.slug, similarity: Number(r.similarity) }));
  } else if (category === "bike_brand") {
    const rows = await db
      .select({
        brand: userMotorcycles.brand,
        similarity: sql<number>`similarity(normalize_text(${userMotorcycles.brand}), ${normalized})`,
      })
      .from(userMotorcycles)
      .where(sql`normalize_text(${userMotorcycles.brand}) % ${normalized}`)
      .groupBy(userMotorcycles.brand, sql`similarity(normalize_text(${userMotorcycles.brand}), ${normalized})`)
      .orderBy(desc(sql`similarity(normalize_text(${userMotorcycles.brand}), ${normalized})`))
      .limit(limit * 3);
    raw = rows.map((r) => ({ id: null, value: r.brand, similarity: Number(r.similarity) }));
  } else if (category === "bike_model") {
    const rows = await db
      .select({
        model: userMotorcycles.model,
        similarity: sql<number>`similarity(normalize_text(${userMotorcycles.model}), ${normalized})`,
      })
      .from(userMotorcycles)
      .where(sql`normalize_text(${userMotorcycles.model}) % ${normalized}`)
      .groupBy(userMotorcycles.model, sql`similarity(normalize_text(${userMotorcycles.model}), ${normalized})`)
      .orderBy(desc(sql`similarity(normalize_text(${userMotorcycles.model}), ${normalized})`))
      .limit(limit * 3);
    raw = rows.map((r) => ({ id: null, value: r.model, similarity: Number(r.similarity) }));
  } else if (category === "city") {
    const rows = await db
      .select({
        region: users.region,
        similarity: sql<number>`similarity(normalize_text(${users.region}), ${normalized})`,
      })
      .from(users)
      .where(
        and(
          sql`${users.region} IS NOT NULL`,
          sql`normalize_text(${users.region}) % ${normalized}`,
        ),
      )
      .groupBy(users.region, sql`similarity(normalize_text(${users.region}), ${normalized})`)
      .orderBy(desc(sql`similarity(normalize_text(${users.region}), ${normalized})`))
      .limit(limit * 3);
    raw = rows
      .filter((r) => !!r.region)
      .map((r) => ({ id: null, value: r.region as string, similarity: Number(r.similarity) }));
  } else if (category === "nickname") {
    const rows = await db
      .select({
        id: users.id,
        nickname: users.nickname,
        similarity: sql<number>`similarity(normalize_text(${users.nickname}), ${normalized})`,
      })
      .from(users)
      .where(sql`normalize_text(${users.nickname}) % ${normalized}`)
      .orderBy(desc(sql`similarity(normalize_text(${users.nickname}), ${normalized})`))
      .limit(limit * 3);
    raw = rows.map((r) => ({ id: r.id, value: r.nickname, similarity: Number(r.similarity) }));
  }

  // Fallback ILIKE per substring match anche se trigram non scatta.
  if (raw.length === 0 && normalized.length >= 3) {
    raw = await ilikeFallback(normalized, category, limit);
  }

  // Filtra per soglia e ri-ranking via fast-fuzzy.
  const filtered = raw.filter((r) => r.similarity >= threshold || normalized.length < 4);
  if (filtered.length === 0) return [];

  const searcher = new Searcher(filtered, {
    keySelector: (item) => item.value,
    threshold: 0,
  });
  const refined = searcher.search(normalized, { returnMatchData: true });
  const refinedMap = new Map<string, number>();
  for (const r of refined) {
    refinedMap.set(r.item.value, r.score);
  }
  const merged = filtered
    .map((f) => {
      const fastScore = refinedMap.get(f.value);
      const combined = fastScore != null ? Math.max(f.similarity, fastScore * 0.95) : f.similarity;
      return { ...f, similarity: Number(combined.toFixed(3)) };
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
  return merged;
}

async function ilikeFallback(
  normalized: string,
  category: TextAliasCategory,
  limit: number,
): Promise<Array<{ id: string | null; value: string; slug?: string | null; similarity: number }>> {
  const like = `%${normalized}%`;
  const tagCategorySlug = mapToTagCategorySlug(category);
  if (tagCategorySlug) {
    const rows = await db
      .select({ id: tags.id, label: tags.label, slug: tags.slug })
      .from(tags)
      .innerJoin(tagCategories, eq(tagCategories.id, tags.categoryId))
      .where(and(eq(tagCategories.slug, tagCategorySlug), ilike(tags.label, like)))
      .limit(limit);
    return rows.map((r) => ({ id: r.id, value: r.label, slug: r.slug, similarity: 0.35 }));
  }
  return [];
}

function mapToTagCategorySlug(category: TextAliasCategory): string | null {
  switch (category) {
    case "music_tag":
      return "musica";
    case "riding_style_tag":
      return "stile_guida";
    case "moto_type_tag":
      return "tipo_moto";
    default:
      return null;
  }
}
