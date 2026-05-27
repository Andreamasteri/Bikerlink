import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  text,
  timestamp,
  index,
  uniqueIndex,
  real,
} from "drizzle-orm/pg-core";

/**
 * Sistema Tag generico (Task #2512).
 *
 * Tre tabelle:
 *  - tag_categories      : raggruppa i tag (musica, stile_guida, tipo_moto, ...).
 *  - tags                : etichette appartenenti a una categoria.
 *  - entity_tags         : associazione poliforma (entityType + entityId) → tag.
 *
 * Le entity sono identificate da una coppia (entityType, entityId).
 *  - entityType "user"        → entityId = users.id
 *  - entityType "motorcycle"  → entityId = user_motorcycles.id
 * Non c'è FK perché entityId punta a tabelle diverse a seconda del tipo.
 * Pulizia di righe orfane è responsabilità dei job batch o degli onDelete
 * applicativi.
 */

export const tagCategories = pgTable("tag_categories", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  // Slug machine-readable (es. "musica", "stile_guida", "tipo_moto").
  slug: varchar("slug", { length: 50 }).notNull().unique(),
  // Etichetta human-readable in italiano (es. "Musica").
  label: varchar("label", { length: 100 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const tags = pgTable("tags", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  categoryId: varchar("category_id", { length: 36 })
    .notNull()
    .references(() => tagCategories.id, { onDelete: "cascade" }),
  // Slug univoco dentro la categoria (es. "hard-rock").
  slug: varchar("slug", { length: 80 }).notNull(),
  label: varchar("label", { length: 120 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("tags_category_slug_uq").on(table.categoryId, table.slug),
  index("tags_category_idx").on(table.categoryId),
]);

export const entityTags = pgTable("entity_tags", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  entityType: varchar("entity_type", { length: 30 }).notNull(),
  entityId: varchar("entity_id", { length: 36 }).notNull(),
  tagId: varchar("tag_id", { length: 36 })
    .notNull()
    .references(() => tags.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("entity_tags_unique_idx").on(table.entityType, table.entityId, table.tagId),
  index("entity_tags_entity_idx").on(table.entityType, table.entityId),
  index("entity_tags_tag_idx").on(table.tagId),
]);

export type TagCategory = typeof tagCategories.$inferSelect;
export type InsertTagCategory = typeof tagCategories.$inferInsert;
export type Tag = typeof tags.$inferSelect;
export type InsertTag = typeof tags.$inferInsert;
export type EntityTag = typeof entityTags.$inferSelect;
export type InsertEntityTag = typeof entityTags.$inferInsert;

export const TAG_ENTITY_TYPES = ["user", "motorcycle"] as const;
export type TagEntityType = (typeof TAG_ENTITY_TYPES)[number];

export const TAG_CATEGORY_SLUGS = {
  MUSICA: "musica",
  STILE_GUIDA: "stile_guida",
  TIPO_MOTO: "tipo_moto",
} as const;

/**
 * Text aliases (Task #2518) — mappa input normalizzato (lowercase + unaccent,
 * vedi `normalize_text()` in migrations/0036_text_interpreter.sql) verso un
 * target. Due modalità:
 *  - target_id: FK opzionale a tags.id (categorie con tabella tags)
 *  - target_value: stringa libera per categorie senza tabella (es. città,
 *    marche moto).
 * Le categorie supportate sono in TEXT_ALIAS_CATEGORIES.
 */
export const textAliases = pgTable("text_aliases", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  category: varchar("category", { length: 50 }).notNull(),
  inputNormalized: varchar("input_normalized", { length: 200 }).notNull(),
  targetId: varchar("target_id", { length: 36 }).references(() => tags.id, {
    onDelete: "cascade",
  }),
  targetValue: varchar("target_value", { length: 200 }),
  confidence: real("confidence").notNull().default(1.0),
  source: varchar("source", { length: 20 }).notNull().default("seed"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("text_aliases_cat_input_uq").on(table.category, table.inputNormalized),
  index("text_aliases_category_idx").on(table.category),
  index("text_aliases_target_idx").on(table.targetId),
]);

export type TextAlias = typeof textAliases.$inferSelect;
export type InsertTextAlias = typeof textAliases.$inferInsert;

export const TEXT_ALIAS_CATEGORIES = [
  "music_tag",
  "riding_style_tag",
  "moto_type_tag",
  "bike_brand",
  "bike_model",
  "city",
  "nickname",
] as const;
export type TextAliasCategory = (typeof TEXT_ALIAS_CATEGORIES)[number];
