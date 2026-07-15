/**
 * Ares Jobs — stato persistito dei job (Task #87).
 *
 * Lo stato di avanzamento di ciascun job vive in AppSettings (valueJson), così è
 * consultabile mentre il job gira senza tenere aperta la chat, e sopravvive a un
 * riavvio del processo (per SEGNALARE l'interruzione — mai per auto-riprendere).
 *
 * Nota: questo store è INDIPENDENTE da quello di Horus (aiAnalysisRuns/
 * aiAnalysisArtifacts). Le due capacità non condividono schema né job.
 */

import { storage } from "../../storage";
import { ARES_JOB_KEYS, STALE_RUNNING_MS, type AresJobMode } from "./constants";

export type AresJobStatus =
  | "idle"
  | "running"
  | "completed"
  | "failed"
  | "interrupted";

export type AresJobTrigger =
  | "admin-panel"
  | "admin-action"
  | "bowie-chat"
  | null;

export interface AresJobState {
  mode: AresJobMode;
  status: AresJobStatus;
  startedAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
  startedBy: string | null;
  trigger: AresJobTrigger;
  model: string | null;
  cursor: number; // prossimo chunk da elaborare
  totalChunks: number;
  totalFiles: number;
  processedFiles: number;
  error: string | null;
  // analysis
  findings?: string[];
  report?: string | null;
  // manual
  sections?: string[];
  manualLength?: number;
  previousManualLength?: number | null;
  reindexed?: boolean;
}

export function emptyState(mode: AresJobMode): AresJobState {
  return {
    mode,
    status: "idle",
    startedAt: null,
    updatedAt: null,
    completedAt: null,
    startedBy: null,
    trigger: null,
    model: null,
    cursor: 0,
    totalChunks: 0,
    totalFiles: 0,
    processedFiles: 0,
    error: null,
    findings: mode === "analysis" ? [] : undefined,
    report: mode === "analysis" ? null : undefined,
    sections: mode === "manual" ? [] : undefined,
    manualLength: mode === "manual" ? 0 : undefined,
    previousManualLength: mode === "manual" ? null : undefined,
    reindexed: mode === "manual" ? false : undefined,
  };
}

/** Legge lo stato persistito grezzo (null se mai scritto). */
export async function readJobState(mode: AresJobMode): Promise<AresJobState | null> {
  const row = await storage.getAppSetting(ARES_JOB_KEYS[mode]);
  const raw = row?.valueJson;
  if (raw && typeof raw === "object" && (raw as AresJobState).mode === mode) {
    return raw as AresJobState;
  }
  return null;
}

/** Scrive lo stato persistito (valueJson, 3° argomento di upsertAppSetting). */
export async function writeJobState(state: AresJobState): Promise<void> {
  const next: AresJobState = { ...state, updatedAt: new Date().toISOString() };
  await storage.upsertAppSetting(ARES_JOB_KEYS[state.mode], undefined, next);
}

/**
 * true se lo stato persistito è "running" ma stantio (updatedAt troppo vecchio):
 * significa che il loop in-process non è più vivo (es. riavvio del processo).
 * La ripresa richiede una nuova richiesta esplicita — nessuna auto-ripresa.
 */
export function isStaleRunning(state: AresJobState | null): boolean {
  if (!state || state.status !== "running") return false;
  const ts = state.updatedAt ? Date.parse(state.updatedAt) : 0;
  if (!ts) return true;
  return Date.now() - ts > STALE_RUNNING_MS;
}
