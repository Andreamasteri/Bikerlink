// Task #10 (Quebracho c) — bridge di SOLA LETTURA Bowie/Ares → stato Quebracho.
//
// Simmetrico a server/ai/matching/coordinator-bridge.ts (che è scrivibile,
// riservato a Horus): qui non è esposta NESSUNA funzione di scrittura. Pensato
// per essere iniettato nel system prompt o in un futuro tool-call (Task
// #7/#11 — hardening tool-calling) senza dover toccare di nuovo job-gate/
// job-registry. Quebracho resta admin-only in chat (roster.ts): questo bridge
// serve solo a far SAPERE a Bowie/Ares se il regista è sereno o in affanno,
// mai a farli intervenire.
import {
  getCoordinatorHealthSummary,
  getCoordinatorJobsSnapshot,
  isCoordinatorKillSwitchActive,
  isQuebrachoUnreachable,
} from "../coordinator/job-gate";

export interface QuebrachoStatusForPersona {
  killSwitch: boolean;
  quebrachoReachable: boolean;
  jobs: { total: number; running: number; paused: number; throttled: number };
  recentFailures: number;
}

/** Stato aggregato, sola lettura, sicuro da esporre a Bowie/Ares. */
export async function getQuebrachoStatusForPersona(): Promise<QuebrachoStatusForPersona> {
  const [killSwitch, unreachable] = await Promise.all([
    isCoordinatorKillSwitchActive(),
    isQuebrachoUnreachable(),
  ]);
  const summary = getCoordinatorHealthSummary();
  const jobs = getCoordinatorJobsSnapshot();
  const recentFailures = jobs.filter((j) => j.lastErrorAt !== null && (j.lastSuccessAt === null || j.lastErrorAt > j.lastSuccessAt)).length;
  return {
    killSwitch,
    quebrachoReachable: !unreachable,
    jobs: summary.jobs,
    recentFailures,
  };
}

/** Breve riga testuale pronta per un system prompt, senza dettagli sensibili. */
export function renderQuebrachoStatusLine(status: QuebrachoStatusForPersona): string {
  if (status.killSwitch) return "Quebracho: kill-switch attivo, tutti i job in pausa (decisione admin).";
  if (!status.quebrachoReachable) return "Quebracho non è raggiungibile in questo momento (fallback deterministico attivo sui job).";
  const { jobs, recentFailures } = status;
  return `Quebracho: ${jobs.running}/${jobs.total} job in esecuzione, ${jobs.paused} in pausa, ${jobs.throttled} in throttle` +
    (recentFailures > 0 ? `, ${recentFailures} con ultimo esito in errore.` : ".");
}
