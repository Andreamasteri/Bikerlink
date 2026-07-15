/**
 * Nadir — scheduler del job notturno (Task #75, step 2 & 3).
 *
 * Ogni notte alle 03:30 (Europe/Rome): reindicizza le tre sorgenti Nadir (tollerante
 * ai fallimenti, mantiene servendo il vecchio indice) e poi esegue una VERA ricerca
 * di controllo che, se rotta, alza un allarme admin e traccia lo streak di notti
 * fallite. La logica sta in server/ai/nadir/reindex.ts; qui c'è solo lo scheduling.
 */
import { Cron } from "croner";
import { dedupWarn } from "../lib/dedup-logger";
import { withJobGate } from "../ai/coordinator/gated-job";
import { runNadirNightly } from "../ai/nadir";
import { NADIR_LOG_PREFIX } from "../ai/nadir/constants";

const TIMEZONE = "Europe/Rome";

let _scheduled = false;

export function scheduleNadirNightly(): void {
  if (_scheduled) return;
  _scheduled = true;
  const _gatedRun = withJobGate("nadir-nightly", () => {
    runNadirNightly().catch((e) =>
      dedupWarn("nadir-nightly", `${NADIR_LOG_PREFIX} scheduled run error (non-fatal)`, e),
    );
  });
  try {
    new Cron("30 3 * * *", { timezone: TIMEZONE, protect: true }, _gatedRun);
  } catch (cronErr) {
    console.warn(`${NADIR_LOG_PREFIX} croner non disponibile, fallback intervallo 24h:`, cronErr);
    const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
    const DELAY_TO_NIGHT_MS = 3.5 * 60 * 60 * 1000; // ritardo iniziale approssimativo
    setTimeout(() => {
      void _gatedRun();
      setInterval(_gatedRun, TWENTY_FOUR_HOURS_MS);
    }, DELAY_TO_NIGHT_MS);
  }
}
