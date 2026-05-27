import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  timestamp,
  vector,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/**
 * Task #2514 — Generic embeddings table.
 *
 * One row per (entityType, entityId, field). Stores the OpenAI
 * `text-embedding-3-small` vector (1536 dimensions) along with the model
 * version that produced it, so future model upgrades can re-embed without
 * losing history.
 *
 * `sourceHash` is the sha256 of the input text; used to skip regeneration
 * when the source text hasn't changed.
 */
export const embeddings = pgTable(
  "embeddings",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    entityType: varchar("entity_type", { length: 40 }).notNull(),
    entityId: varchar("entity_id", { length: 36 }).notNull(),
    field: varchar("field", { length: 40 }).notNull(),
    embedding: vector("embedding", { dimensions: 1536 }).notNull(),
    model: varchar("model", { length: 80 }).notNull(),
    sourceHash: varchar("source_hash", { length: 64 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("embeddings_entity_field_unique").on(
      table.entityType,
      table.entityId,
      table.field,
    ),
    index("embeddings_type_field_idx").on(table.entityType, table.field),
  ],
);

export type Embedding = typeof embeddings.$inferSelect;
export type NewEmbedding = typeof embeddings.$inferInsert;
