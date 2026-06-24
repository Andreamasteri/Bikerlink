// Task #4825 — Classificazione deterministica fix sicuro (🟢) vs revisione (🔴).
// NON dipende dall'AI: è hardcodata. Approccio ALLOWLIST conservativo — un fix è
// "sicuro" SOLO se ricade in una categoria esplicitamente meccanica/additiva;
// tutto il resto richiede revisione umana (🔴).
import type { CheckResult } from "./types";

// Categorie i cui fix sono additivi/meccanici e verificabili senza giudizio
// (aggiungere/rimuovere import, spostare un file, rimuovere codice morto).
// Qualsiasi categoria NON in questa lista è considerata "da rivedere".
const SAFE_CATEGORIES = new Set([
  "imports",
  "file-placement",
  "dead-code",
]);

// Pattern (su description/checkId) che marcano un fix come rischioso anche se la
// categoria sarebbe altrimenti sicura: scattano per declassare 🟢 → 🔴.
const RISKY_PATTERNS = [
  /refactor/i,
  /logica di business/i,
  /business logic/i,
  /password/i,
  /token/i,
  /secret/i,
  /migration/i,
  /schema/i,
  /endpoint/i,
  /metodo http/i,
  /race condition/i,
  /rinomin/i, // rinomina/rinominare
  /rename/i,
  /spost.* funzione/i, // spostare una funzione (non un file)
];

/**
 * Decide se un risultato è un "fix sicuro" (additivo/meccanico, verificabile)
 * oppure richiede revisione umana. Idempotente — chiamare prima di salvare.
 * Default conservativo: in caso di dubbio → revisione (false).
 */
export function classifySafety(r: CheckResult): boolean {
  // Allowlist: fuori dalle categorie sicure è sempre revisione.
  if (!SAFE_CATEGORIES.has(r.category)) return false;
  // Override pattern rischiosi anche dentro le categorie sicure.
  const haystack = `${r.checkId} ${r.description}`;
  if (RISKY_PATTERNS.some((p) => p.test(haystack))) return false;
  // I critici restano segnalati ma non auto-fixabili: meglio revisione.
  if (r.severity === "critical") return false;
  return true;
}

export function annotateSafety(results: CheckResult[]): CheckResult[] {
  for (const r of results) {
    r.safeFix = classifySafety(r);
  }
  return results;
}
