/**
 * Ares Jobs — barrel (Task #87).
 *
 * Due capacità long-running di Ares, SOLO on-demand:
 *   • "analysis" — analisi completa codice + DB → proposte/migliorie.
 *   • "manual"   — manuale testuale dell'app salvato nello storage di Nadir.
 */

export type { AresJobMode } from "./constants";
export {
  startAresJob,
  stopAresJob,
  getAresJobStatus,
  getAllAresJobStatuses,
  type StartResult,
  type AresJobStatusView,
} from "./runner";
export {
  withAresInteractivePriority,
  isAresInteractiveBusy,
} from "./priority-gate";
export type { AresJobState, AresJobStatus, AresJobTrigger } from "./state";
