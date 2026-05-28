-- Task #2514 — pgvector extension + generic embeddings table
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "embeddings" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "entity_type" varchar(40) NOT NULL,
  "entity_id" varchar(36) NOT NULL,
  "field" varchar(40) NOT NULL,
  "embedding" vector(1536) NOT NULL,
  "model" varchar(80) NOT NULL,
  "source_hash" varchar(64),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "embeddings_entity_field_unique"
  ON "embeddings" ("entity_type", "entity_id", "field");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "embeddings_type_field_idx"
  ON "embeddings" ("entity_type", "field");
--> statement-breakpoint
-- HNSW index on cosine distance for fast similarity search.
-- Requires pgvector >= 0.5.0; provider reports 0.8.0 — OK.
CREATE INDEX IF NOT EXISTS "embeddings_vec_hnsw_cosine_idx"
  ON "embeddings" USING hnsw ("embedding" vector_cosine_ops);
