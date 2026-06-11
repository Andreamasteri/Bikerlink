import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  timestamp,
  vector,
  uniqueIndex,
  index,
  serial,
  text,
  boolean,
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

/**
 * Audit log for every embedding operation (API call or cache hit).
 * Used for daily usage analysis, anomaly detection, and hard daily cap enforcement.
 * Rows are purged after 30 days by the log-retention job.
 */
export const embeddingCallLog = pgTable(
  "embedding_call_log",
  {
    id: serial("id").primaryKey(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    field: text("field").notNull(),
    model: text("model").notNull(),
    cached: boolean("cached").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("embedding_call_log_created_at_idx").on(table.createdAt),
  ],
);

export type EmbeddingCallLog = typeof embeddingCallLog.$inferSelect;
export type NewEmbeddingCallLog = typeof embeddingCallLog.$inferInsert;
