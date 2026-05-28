// Task #2678 — Schema entry-point for drizzle-kit ONLY.
//
// Do NOT use this file in application code — use shared/db/index.ts instead.
//
// Why a separate file: shared/db/integrity.ts defines "integrity_*" tables that
// were the first-generation app integrity system (task #2537). These tables
// already exist in both dev and prod. shared/db/db-integrity.ts defines the
// "db_integrity_*" tables (task #2536). When both sets are visible to drizzle-kit
// at the same time, the tablesResolver calls promptNamedWithSchemasConflict,
// detecting a potential rename between the two structurally-similar families.
// That prompt requires a TTY and crashes non-interactive CI/deploy builds.
//
// Solution: exclude integrity.ts from drizzle-kit's schema. The integrity_*
// tables remain in the DB and are used by the app — they're just not managed by
// drizzle-kit (tablesFilter in drizzle.config.ts prevents accidental DROPs).
export * from "./users";
export * from "./auth";
export * from "./proposals";
export * from "./conversations";
export * from "./tracking";
export * from "./planned-routes";
export * from "./contest";
export * from "./workshops";
export * from "./social";
export * from "./ads";
export * from "./system";
export * from "./matching";
export * from "./sos";
export * from "./motoclubs";
export * from "./music";
export * from "./events";
export * from "./gps";
export * from "./road-hazards";
export * from "./ota";
export * from "./tags";
export * from "./embeddings";
export * from "./watchdog";
export * from "./db-integrity";
export * from "./ai-console";
export * from "./ai-coordinator";
