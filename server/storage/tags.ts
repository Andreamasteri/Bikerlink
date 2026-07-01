import { eq, and, asc, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  tagCategories,
  tags,
  entityTags,
  type TagCategory,
  type Tag,
  type EntityTag,
  type InsertTag,
} from "@shared/db";
import { TrackingStorage } from "./tracking";
import { cacheGet, cacheSet, cacheDel } from "../cache/cache";
import { enqueueMusicTasteEmbedding } from "../embeddings/music-text";

const TAGS_CACHE_NS = "tags-for-entity";
const TAGS_CACHE_TTL_S = 120;

function tagsCacheKey(entityType: string, entityId: string): string {
  return `${entityType}:${entityId}`;
}

/**
 * Tag system storage (Task #2512).
 *
 * Helper centralizzati per leggere/scrivere tag e associarli a entità
 * generiche (entityType + entityId). Vedi shared/db/tags.ts per le
 * convenzioni sui tipi di entità supportati.
 */
export class TagsStorage extends TrackingStorage {
  async listTagCategories(): Promise<TagCategory[]> {
    return db.select().from(tagCategories).orderBy(asc(tagCategories.label));
  }

  async getTagCategoryBySlug(slug: string): Promise<TagCategory | undefined> {
    const [row] = await db
      .select()
      .from(tagCategories)
      .where(eq(tagCategories.slug, slug))
      .limit(1);
    return row;
  }

  async listTagsByCategorySlug(slug: string): Promise<Tag[]> {
    const cat = await this.getTagCategoryBySlug(slug);
    if (!cat) return [];
    return db
      .select()
      .from(tags)
      .where(eq(tags.categoryId, cat.id))
      .orderBy(asc(tags.label));
  }

  async listAllTagsWithCategory(): Promise<
    Array<{ tag: Tag; category: TagCategory }>
  > {
    const rows = await db
      .select({ tag: tags, category: tagCategories })
      .from(tags)
      .leftJoin(tagCategories, eq(tagCategories.id, tags.categoryId))
      .orderBy(asc(tagCategories.label), asc(tags.label));
    return rows
      .filter((r): r is { tag: Tag; category: TagCategory } => r.category !== null)
      .map((r) => ({ tag: r.tag, category: r.category }));
  }

  async getTagById(id: string): Promise<Tag | undefined> {
    const [row] = await db.select().from(tags).where(eq(tags.id, id)).limit(1);
    return row;
  }

  async createTag(data: InsertTag): Promise<Tag> {
    const [row] = await db.insert(tags).values(data).returning();
    return row;
  }

  async deleteTag(id: string): Promise<boolean> {
    const rows = await db
      .delete(tags)
      .where(eq(tags.id, id))
      .returning({ id: tags.id });
    return rows.length > 0;
  }

  /**
   * Restituisce tutti i tag associati a una entità, arricchiti con la
   * categoria di appartenenza. Utile per UI profilo/garage.
   */
  async getTagsForEntity(
    entityType: string,
    entityId: string,
  ): Promise<Array<Tag & { categorySlug: string; categoryLabel: string }>> {
    const cacheKey = tagsCacheKey(entityType, entityId);
    const cached = await cacheGet<Array<Tag & { categorySlug: string; categoryLabel: string }>>(
      TAGS_CACHE_NS,
      cacheKey,
    );
    if (cached) return cached;
    const rows = await db
      .select({ tag: tags, category: tagCategories })
      .from(entityTags)
      .innerJoin(tags, eq(tags.id, entityTags.tagId))
      .innerJoin(tagCategories, eq(tagCategories.id, tags.categoryId))
      .where(
        and(
          eq(entityTags.entityType, entityType),
          eq(entityTags.entityId, entityId),
        ),
      )
      .orderBy(asc(tagCategories.label), asc(tags.label));
    const result = rows.map((r) => ({
      ...r.tag,
      categorySlug: r.category.slug,
      categoryLabel: r.category.label,
    }));
    // Populate DragonflyDB cache (no-op when TC_DRAGONFLY_URL unset).
    void cacheSet(TAGS_CACHE_NS, cacheKey, result, TAGS_CACHE_TTL_S);
    return result;
  }

  /**
   * Sostituisce in modo atomico l'insieme di tag di una categoria per
   * un'entità: rimuove i tag della categoria non più presenti e inserisce
   * quelli nuovi. Tag di altre categorie restano invariati.
   *
   * Se `categorySlug` è null/undefined, ricalcola tutte le categorie e
   * lascia intatti solo i tag di categorie non rappresentate in `tagIds`.
   */
  async setTagsForEntity(
    entityType: string,
    entityId: string,
    tagIds: string[],
    options?: { categorySlug?: string },
  ): Promise<EntityTag[]> {
    const uniqueIds = Array.from(new Set(tagIds));

    // Valida che i tag esistano (e, se fornita una categorySlug, che
    // appartengano alla categoria).
    let validTagRows: Tag[] = [];
    if (uniqueIds.length > 0) {
      validTagRows = await db.select().from(tags).where(inArray(tags.id, uniqueIds));
      if (validTagRows.length !== uniqueIds.length) {
        const found = new Set(validTagRows.map((t) => t.id));
        const missing = uniqueIds.filter((id) => !found.has(id));
        throw new Error(`Tag inesistenti: ${missing.join(", ")}`);
      }
      if (options?.categorySlug) {
        const cat = await this.getTagCategoryBySlug(options.categorySlug);
        if (!cat) throw new Error(`Categoria non trovata: ${options.categorySlug}`);
        const wrong = validTagRows.filter((t) => t.categoryId !== cat.id);
        if (wrong.length > 0) {
          throw new Error(
            `Tag non appartenenti a categoria ${options.categorySlug}: ${wrong.map((t) => t.id).join(", ")}`,
          );
        }
      }
    }

    // Invalidate DragonflyDB cache after mutation completes.
    void cacheDel(TAGS_CACHE_NS, tagsCacheKey(entityType, entityId));

    return await db.transaction(async (tx) => {
      if (options?.categorySlug) {
        // Cancella solo i tag della categoria target.
        const cat = await tx
          .select()
          .from(tagCategories)
          .where(eq(tagCategories.slug, options.categorySlug))
          .limit(1);
        if (cat.length > 0) {
          const catTagsRows = await tx
            .select({ id: tags.id })
            .from(tags)
            .where(eq(tags.categoryId, cat[0].id));
          const catTagIds = catTagsRows.map((r) => r.id);
          if (catTagIds.length > 0) {
            await tx
              .delete(entityTags)
              .where(
                and(
                  eq(entityTags.entityType, entityType),
                  eq(entityTags.entityId, entityId),
                  inArray(entityTags.tagId, catTagIds),
                ),
              );
          }
        }
      } else {
        // Sostituisci tutto: cancella tutte le righe per questa entità.
        await tx
          .delete(entityTags)
          .where(
            and(
              eq(entityTags.entityType, entityType),
              eq(entityTags.entityId, entityId),
            ),
          );
      }

      if (uniqueIds.length === 0) return [];

      const inserted = await tx
        .insert(entityTags)
        .values(uniqueIds.map((tagId) => ({ entityType, entityId, tagId })))
        .onConflictDoNothing()
        .returning();
      return inserted;
    }).then((res) => {
      // Task #2516 — se sono cambiati i tag musicali di un utente, accoda
      // la rigenerazione dell'embedding `music_taste` (fire-and-forget).
      // Per categorySlug='musica' triggera sempre; per replace-all (nessuna
      // categorySlug) triggera comunque perché potrebbe aver rimosso tag
      // musica precedenti — la coda è idempotente via source-hash.
      if (entityType === "user" && (options?.categorySlug === "musica" || !options?.categorySlug)) {
        enqueueMusicTasteEmbedding(entityId);
      }
      return res;
    });
  }
}
