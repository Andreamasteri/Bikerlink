// Task #2603 — estratto da app/admin/match-control.tsx (mechanical split)
export interface AppSettingRow {
  key: string;
  value: string | null;
}

export const FRESHNESS_KEYS = {
  halflifeGeneric: "match_freshness_halflife_generic_days",
  halflifeProposal: "match_freshness_halflife_proposal_days",
  archiveAfter: "match_archive_after_days",
} as const;

export interface MatchStat {
  typeKey: string;
  typeName: string;
  usersActive: number;
  totalMatches: number;
  isAnomaly: boolean;
  isBzBase?: boolean;
}

export interface CycleMeta {
  completedAt: string;
  durationMs: number;
  zavorrinaMatchesNew: number;
  bikerBikerMatchesNew: number;
}

export interface MatchSettingsResponse {
  visible: boolean;
  autoMatchEnabled?: boolean;
  cycleMeta?: CycleMeta | null;
  stats: MatchStat[];
}

export interface MatchingStatsResponse {
  bikerBiker: { new: number; accepted: number; rejected: number; total: number };
  bikerZavorrina: { new: number; accepted: number; rejected: number; total: number };
}

export interface LockStateResponse {
  isRunning: boolean;
  lastStartAt: number | null;
  lastStartIso: string | null;
  elapsedMs: number | null;
}

// Task #2527 — `formatDate` / `formatDuration` ora vivono nei sotto-componenti
// (CycleMetaCard, LockCard). Manteniamo le funzioni unused-prefixed così se in
// futuro servono di nuovo in questo file sono pronte.
export function _formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("it-IT", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

export function _formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}
