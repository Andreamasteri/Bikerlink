import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  boolean,
  timestamp,
  jsonb,
  index,
  serial,
  integer,
} from "drizzle-orm/pg-core";

export const pipelineFlowEvents = pgTable("pipeline_flow_events", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  pipeline: varchar("pipeline", { length: 60 }).notNull(),
  traceId: varchar("trace_id", { length: 32 }).notNull(),
  checkpoint: varchar("checkpoint", { length: 80 }).notNull(),
  ts: timestamp("ts").notNull().defaultNow(),
  metaJson: jsonb("meta_json").$type<Record<string, unknown>>(),
  resolved: boolean("resolved").notNull().default(false),
}, (t) => [
  index("pipeline_flow_events_pipeline_idx").on(t.pipeline),
  index("pipeline_flow_events_trace_id_idx").on(t.traceId),
  index("pipeline_flow_events_ts_idx").on(t.ts),
  index("pipeline_flow_events_resolved_idx").on(t.resolved, t.ts),
]);

export type PipelineFlowEvent = typeof pipelineFlowEvents.$inferSelect;
export type InsertPipelineFlowEvent = typeof pipelineFlowEvents.$inferInsert;

// ── storico esiti probe ────────────────────────────────────────────────────────

export const pipelineProbeHistory = pgTable("pipeline_probe_history", {
  id: serial("id").primaryKey(),
  pipeline: varchar("pipeline", { length: 60 }).notNull(),
  overall: varchar("overall", { length: 20 }).notNull(),
  steps: jsonb("steps").$type<Array<{ name: string; status: string; durationMs: number; message?: string }>>().notNull(),
  durationMs: integer("duration_ms").notNull(),
  runAt: timestamp("run_at").notNull().defaultNow(),
}, (t) => [
  index("pipeline_probe_history_pipeline_run_at_idx").on(t.pipeline, t.runAt.desc()),
]);

export type PipelineProbeHistory = typeof pipelineProbeHistory.$inferSelect;
export type InsertPipelineProbeHistory = typeof pipelineProbeHistory.$inferInsert;
