// Task #877 — Auto-fix: ricostruzione indice HNSW embedding su accettazione proposta Horus.
import type { AutoFixRule } from "../types";
import { rebuildHnswIndex } from "../../../embeddings/store";

// Flag in-memory: evita avviare due rebuild contemporanei (operazione CONCURRENTLY
// non rientrante — un secondo DROP INDEX sull'indice in costruzione lo annullerebbe).
let _rebuildInProgress = false;

export const rebuildIndexRule: AutoFixRule = {
  id: "rebuild_index",
  description: "Ricostruzione indice HNSW embedding (DROP + CREATE CONCURRENTLY)",
  async run(_snap) {
    if (_rebuildInProgress) {
      return { applied: false, reason: "rebuild già in corso — attendere il completamento" };
    }
    _rebuildInProgress = true;
    try {
      const result = await rebuildHnswIndex(false);
      if (result.action === "noop") {
        return { applied: false, reason: "indice già valido — nessun rebuild necessario" };
      }
      return {
        applied: true,
        summary: `Indice HNSW ${result.action === "created" ? "creato" : "ricostruito"} con successo (valid=${result.status.valid})`,
        details: { action: result.action, indexStatus: result.status },
      };
    } finally {
      _rebuildInProgress = false;
    }
  },
};
