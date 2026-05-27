// Task #2533 — Auto-fix: se rate 5xx supera 10/min ma sotto soglia "fuoco",
// non agiamo (deve restare visibile). Questa rule è un placeholder
// volutamente conservativo: non resetta nulla, ma logga un summary se rate
// è in calo significativo per pulire il segnale.
import type { AutoFixRule } from "../types";

export const resetErrorWindow: AutoFixRule = {
  id: "noop_error_window",
  description: "Annota tendenza errori (non muta stato)",
  async run() {
    // Volutamente no-op: la presenza in registry serve a documentare
    // l'estensibilità del sistema. Le rule reali per error window
    // (es. circuit-breaker reset) verranno aggiunte in follow-up.
    return { applied: false, reason: "rule informativa" };
  },
};
