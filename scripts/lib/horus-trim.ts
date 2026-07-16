/**
 * Trim logic for the Horus triage bundle.
 *
 * Extracted into its own module so it can be unit-tested without pulling in
 * the DB / Ollama / GitHub dependencies of log-analysis-horus.ts.
 */

/** Stima approssimativa del conteggio token (chars/4). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Sezioni a bassa priorità che possono essere rimosse dal bundle (nell'ordine)
 * quando il totale supera il budget. Le sezioni vengono rimosse in sequenza
 * finché il bundle rientra nel budget o le sezioni sono esaurite.
 *
 * Ordine di rimozione (dalla meno alla più importante):
 *   1. Report Horus precedente — già analizzato, valore marginale nel round corrente
 *   2. weekly_system_reports — blob storico grande, meno urgente dei dati live
 *   3. pg_stat_activity — verboso, le connessioni idle sono meno critiche dei crash
 */
export const TRIM_SECTIONS: Array<{ label: string; re: RegExp }> = [
  {
    label: "TRIAGE PRECEDENTE (report round precedente)",
    // La sezione inizia con \n## TRIAGE PRECEDENTE\n e finisce a ## RICHIESTA o fine stringa.
    // NON usare \n## [A-Z] come stop generico: il corpo del report precedente contiene
    // sottosezioni ## PROBLEMI TROVATI / ## TASK PROPOSTI che farebbero scattare il
    // lookahead troppo presto, lasciando il blocco parzialmente in piedi.
    re: /\n## TRIAGE PRECEDENTE\n[\s\S]*?(?=\n## RICHIESTA|$)/,
  },
  {
    label: "DB: weekly_system_reports",
    // fmtSection produce \n===== DB: <title> =====\n<body>\n
    re: /\n={5} DB: weekly_system_reports[^\n]*={5}\n[\s\S]*?(?=\n={5}|\n## |$)/,
  },
  {
    label: "DB: pg_stat_activity",
    re: /\n={5} DB: pg_stat_activity[^\n]*={5}\n[\s\S]*?(?=\n={5}|\n## |$)/,
  },
];

/**
 * Rimuove sezioni a bassa priorità dal bundle finché la stima token rientra
 * entro `maxTokens`. Ritorna il bundle (eventualmente ridotto) e la lista
 * delle sezioni rimosse.
 */
export function trimBundleToFit(
  bundle: string,
  maxTokens: number,
): { bundle: string; trimmed: string[] } {
  const trimmed: string[] = [];
  let current = bundle;

  for (const section of TRIM_SECTIONS) {
    if (estimateTokens(current) <= maxTokens) break;
    const before = current.length;
    current = current.replace(section.re, "");
    if (current.length < before) {
      trimmed.push(section.label);
    }
  }

  return { bundle: current, trimmed };
}
