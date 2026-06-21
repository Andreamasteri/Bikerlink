import appJson from '../app.json';

export const RELEASE_NUMBER: number = appJson.expo.android.versionCode;
export const RUNTIME_VERSION: string = appJson.expo.runtimeVersion;

/**
 * Contatore GLOBALE SEQUENZIALE degli OTA applicati — conta tutte le OTA di tutti
 * i cicli APK mai pubblicati (attualmente: 85).
 *
 * ⚠️  NON è il numero dell'OTA nel ciclo APK corrente.
 *     Per sapere quale numero OTA pubblicare nel ciclo corrente,
 *     leggi il versionName corrente da app.json (es. "55.10.10" → prossima OTA = OTA-11).
 *     Vedi: .agents/skills/bikerlink-ota-publish/SKILL.md → sezione "Contesto fisso".
 *
 * Valore null = nessun OTA applicato (installazione fresca o sistema OTA non attivo).
 * Aggiornare questo valore ad ogni OTA pubblicata (sempre +1 rispetto al precedente).
 */
export const APPLIED_OTA_NUMBER: number | null = 129;
