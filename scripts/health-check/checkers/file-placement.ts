// Task #4825 — Checker posizionamento file: file helper dentro app/(tabs)/ (route pollution),
// file orfani .partN/.next, e file sorgente troppo grandi (oltre il ratchet 600).
import { listSourceFiles, safeRead } from "../scan-utils";
import type { CheckResult } from "../types";

const RATCHET_LIMIT = 600;

export async function runFilePlacement(): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  for (const f of listSourceFiles()) {
    // 1) Helper non-route dentro app/(tabs)/ → diventa tab-icona rotta.
    if (/app\/\(tabs\)\//.test(f.rel) && /\.(styles|types|utils|helpers|constants)\.tsx?$/.test(f.rel)) {
      out.push({
        checkId: "FP-tabs-pollution",
        category: "file-placement",
        severity: "warning",
        file: f.rel,
        description: "File helper dentro app/(tabs)/ → la custom tab bar lo renderizza come tab rotta. Spostare in components/",
      });
    }

    // 2) File continuation orfani (.partN / .next) potenzialmente stale.
    if (/\.(part\d+|next)\.tsx?$/.test(f.rel)) {
      const text = safeRead(f.abs);
      if (text.trim().length === 0) {
        out.push({
          checkId: "FP-orphan-stub",
          category: "file-placement",
          severity: "info",
          file: f.rel,
          description: "File .partN/.next vuoto: stub orfano, valutare rimozione",
        });
      }
    }

    // 3) File oltre il ratchet 600 righe.
    const text = safeRead(f.abs);
    if (text) {
      const lines = text.split("\n").length;
      if (lines > RATCHET_LIMIT) {
        out.push({
          checkId: "FP-large-file",
          category: "file-placement",
          severity: "warning",
          file: f.rel,
          line: lines,
          description: `File di ${lines} righe oltre il limite ratchet (${RATCHET_LIMIT}). Splittare in moduli ≤450 righe`,
          evidence: `${lines} righe`,
        });
      }
    }
  }
  return out;
}
