// Task #2536 — Tabelle su cui è permesso restorare righe dalla quarantena.
// Volutamente conservativo: solo tabelle log e relazioni audit-safe.
export const ALLOWED_RESTORE_TABLES = new Set<string>([
  "ai_watchdog_log",
  "ai_suggestions_log",
  "anomaly_events",
  "moderator_digests",
  "system_signals",
  "system_health_snapshot",
  "tag_assignments",
  "match_feedback",
]);
