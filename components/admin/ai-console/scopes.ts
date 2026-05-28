// Task #2641 — Mappa colori scope AI Console (fallback se /scopes fallisce).
// Allineata alla tabella della task: moderation=blu, watchdog=arancio,
// ota=viola, db-integrity=verde, app-integrity=ciano.

export const SCOPE_COLORS: Record<string, string> = {
  moderation: "#2196F3",
  watchdog: "#FF9500",
  ota: "#9C27B0",
  "db-integrity": "#10B981",
  "app-integrity": "#06B6D4",
};

export const SCOPE_LABELS: Record<string, string> = {
  moderation: "Moderazione",
  watchdog: "Watchdog",
  ota: "OTA",
  "db-integrity": "DB Integrity",
  "app-integrity": "App Integrity",
};

export function scopeColor(scope: string): string {
  return SCOPE_COLORS[scope] ?? "#6B7280";
}

export function scopeLabel(scope: string): string {
  return SCOPE_LABELS[scope] ?? scope;
}
