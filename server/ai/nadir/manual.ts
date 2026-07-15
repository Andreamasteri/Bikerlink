/**
 * Nadir — storage del manuale a testo libero (Task #75, step 1).
 *
 * Il manuale è persistito in AppSettings (chiave `nadir_manual_text`), NON in un
 * file git: un admin può leggerlo/scriverlo dal pannello senza redeploy.
 */
import { storage } from "../../storage";
import { NADIR_LOG_PREFIX, NADIR_MANUAL_KEY, NADIR_MANUAL_PREVIOUS_KEY } from "./constants";

/** Legge il manuale corrente (stringa vuota se mai scritto). */
export async function getNadirManual(): Promise<string> {
  const row = await storage.getAppSetting(NADIR_MANUAL_KEY);
  return row?.value ?? "";
}

/**
 * Salva il manuale. Ritorna il testo salvato (troncato/normalizzato). Il salvataggio
 * NON reindicizza da solo: la reindicizzazione avviene di notte o via "reindex now".
 */
export async function saveNadirManual(text: string): Promise<string> {
  const cleaned = (text ?? "").toString();
  await storage.upsertAppSetting(NADIR_MANUAL_KEY, cleaned);
  console.log(`${NADIR_LOG_PREFIX} manuale aggiornato (${cleaned.length} caratteri)`);
  return cleaned;
}

/** Versione precedente del manuale, catturata prima dell'ultima sovrascrittura. */
export interface NadirManualBackup {
  text: string;
  savedAt: string;
}

/**
 * Task #87 — Legge la versione PRECEDENTE del manuale (l'ultima archiviata prima
 * di una sovrascrittura). Ritorna null se non esiste ancora un backup.
 */
export async function getNadirManualPrevious(): Promise<NadirManualBackup | null> {
  const row = await storage.getAppSetting(NADIR_MANUAL_PREVIOUS_KEY);
  const raw = row?.valueJson;
  if (raw && typeof raw === "object" && typeof (raw as NadirManualBackup).text === "string") {
    return raw as NadirManualBackup;
  }
  return null;
}

/**
 * Task #87 — Salva il manuale ARCHIVIANDO prima la versione corrente in un backup
 * dedicato (NADIR_MANUAL_PREVIOUS_KEY), così si può sempre recuperare/confrontare
 * il manuale di prima. Pensato per la rigenerazione automatica del manuale (Ares):
 * la reindicizzazione resta a carico del chiamante (come saveNadirManual).
 */
export async function saveNadirManualWithBackup(
  text: string,
): Promise<{ saved: string; previous: NadirManualBackup | null }> {
  const current = await getNadirManual();
  let previous: NadirManualBackup | null = null;
  if (current.trim().length > 0) {
    previous = { text: current, savedAt: new Date().toISOString() };
    await storage.upsertAppSetting(NADIR_MANUAL_PREVIOUS_KEY, undefined, previous);
    console.log(
      `${NADIR_LOG_PREFIX} versione precedente del manuale archiviata (${current.length} caratteri) prima della sovrascrittura`,
    );
  }
  const saved = await saveNadirManual(text);
  return { saved, previous };
}

/**
 * Spezza il manuale in chunk indicizzabili. Divide prima sui doppi ritorni a capo
 * (paragrafi), poi taglia i paragrafi troppo lunghi a `MANUAL_CHUNK_SIZE` caratteri.
 * Deterministico: l'indice `i` del chunk è stabile finché il testo non cambia.
 */
export function chunkManual(
  text: string,
  chunkSize: number,
  maxChunks: number,
): string[] {
  const normalized = (text ?? "").replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  const paragraphs = normalized
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  for (const para of paragraphs) {
    if (para.length <= chunkSize) {
      chunks.push(para);
    } else {
      for (let i = 0; i < para.length; i += chunkSize) {
        chunks.push(para.slice(i, i + chunkSize).trim());
      }
    }
    if (chunks.length >= maxChunks) break;
  }
  return chunks.slice(0, maxChunks);
}
