export const RELEASE_NUMBER = 54;
export const OTA_BUNDLED_COUNT = 0;
export const RUNTIME_VERSION = "10.0.0";

/**
 * Numero dell'ultimo OTA interno applicato su questo dispositivo.
 * Valore null = nessun OTA applicato (installazione fresca o sistema OTA non attivo).
 * Aggiornare questo valore ad ogni OTA applicato tramite il sistema staged rollout.
 */
export const APPLIED_OTA_NUMBER: number | null = 27;
