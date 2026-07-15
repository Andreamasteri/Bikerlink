/**
 * Nadir — motore di ricerca semantica (Task #75). Barrel di re-export.
 *
 * Nadir NON è una persona: è un motore di ricerca semantica additivo, costruito
 * sopra la pipeline di embedding + store pgvector/HNSW esistenti di BikerLink
 * (divergenza deliberata dal servizio TC standalone di BikerBlog — vedi
 * ./constants.ts).
 */
export * from "./constants";
export {
  getNadirManual,
  saveNadirManual,
  saveNadirManualWithBackup,
  getNadirManualPrevious,
  chunkManual,
  getNadirManualTranslationStatus,
  type NadirManualBackup,
  type NadirManualTranslationState,
  type NadirManualTranslationStatusEntry,
} from "./manual";
export { retranslateManualNow, isRetranslationInFlight } from "./translate";
export {
  searchNadir,
  loadFragmentManifest,
  type NadirFragment,
  type NadirSearchResult,
  type NadirFragmentManifest,
} from "./search";
export {
  reindexNadir,
  runNadirNightly,
  runNadirSearchHealthProbe,
  getNadirSearchHealth,
  type NadirIndexStatus,
  type NadirSearchHealth,
} from "./reindex";
export { getNadirStatus, type NadirStatus } from "./status";
