// Horus Coordinator Bridge — stato del coordinator per Bowie/Ares (sola lettura).
// (ex Quebracho Bridge — Task #591: Quebracho unificato in Horus)
//
// Bridge di SOLA LETTURA: nessuna funzione di scrittura esposta qui.
// Pensato per essere iniettato nel system prompt o in un tool-call senza dover
// toccare job-gate/job-registry. Il coordinator gira sotto Horus.
import {
  getCoordinatorHealthSummary,
  getCoordinatorJobsSnapshot,
  isCoordinatorKillSwitchActive,
  isHorusUnreachable,
} from "../coordinator/job-gate";

export interface HorusCoordinatorStatusForPersona {
  killSwitch: boolean;
  horusReachable: boolean;
  jobs: { total: number; running: number; paused: number; throttled: number };
  recentFailures: number;
}

/** Stato aggregato, sola lettura, sicuro da esporre a Bowie/Ares. */
export async function getHorusCoordinatorStatus(): Promise<HorusCoordinatorStatusForPersona> {
  const [killSwitch, unreachable] = await Promise.all([
    isCoordinatorKillSwitchActive(),
    isHorusUnreachable(),
  ]);
  const summary = getCoordinatorHealthSummary();
  const jobs = getCoordinatorJobsSnapshot();
  const recentFailures = jobs.filter((j) => j.lastErrorAt !== null && (j.lastSuccessAt === null || j.lastErrorAt > j.lastSuccessAt)).length;
  return {
    killSwitch,
    horusReachable: !unreachable,
    jobs: summary.jobs,
    recentFailures,
  };
}

/** Breve riga testuale pronta per un system prompt, senza dettagli sensibili. */
export function renderHorusCoordinatorStatusLine(status: HorusCoordinatorStatusForPersona): string {
  if (status.killSwitch) return "Horus Coordinator: kill-switch attivo, tutti i job in pausa (decisione admin).";
  if (!status.horusReachable) return "Horus Coordinator non è raggiungibile in questo momento (fallback deterministico attivo sui job).";
  const { jobs, recentFailures } = status;
  return `Horus Coordinator: ${jobs.running}/${jobs.total} job in esecuzione, ${jobs.paused} in pausa, ${jobs.throttled} in throttle` +
    (recentFailures > 0 ? `, ${recentFailures} con ultimo esito in errore.` : ".");
}

// Compat aliases — callers that referenced the old Quebracho names.
/** @deprecated Use getHorusCoordinatorStatus() */
export const getQuebrachoStatusForPersona = getHorusCoordinatorStatus;
/** @deprecated Use renderHorusCoordinatorStatusLine() */
export const renderQuebrachoStatusLine = renderHorusCoordinatorStatusLine;
