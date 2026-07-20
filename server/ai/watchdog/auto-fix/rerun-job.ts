// Task #891 — Dispatch rule per actionKind "rerun_job": rilancia il job vacuum
// schedulato (stessa funzione usata dal ciclo notturno). Eseguita SOLO su accept
// esplicito dell'admin (PROPOSAL_DISPATCH_RULES), mai autonoma.
import type { AutoFixRule } from "../types";
import { runVacuumSmart } from "../../../vacuum-service";

export const rerunJobRule: AutoFixRule = {
  id: "rerun_job",
  description: "Rilancia il job vacuum schedulato (stessa funzione del ciclo notturno)",
  async run(_snap) {
    try {
      const outcome = await runVacuumSmart();
      if (outcome === "skipped") {
        return { applied: false, reason: "Vacuum già in corso — rilancio saltato" };
      }
      return {
        applied: true,
        summary: "Vacuum job rilanciato con successo",
        details: { job: "vacuum_smart", outcome },
      };
    } catch (err) {
      return { applied: false, reason: `Rilancio vacuum fallito: ${(err as Error).message}` };
    }
  },
};
