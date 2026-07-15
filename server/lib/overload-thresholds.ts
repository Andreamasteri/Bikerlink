// Task #83 — Cache + accesso alle soglie di sovraccarico regolabili dall'admin.
//
// Le soglie sono persistite come AppSetting (valueJson) ma vengono lette in punti
// caldi e sincroni: il probe di carico backend gira ogni 5s (zero-I/O) e
// updateSustainedOverload è puro. Non possiamo fare una query DB a ogni lettura.
// Perciò teniamo l'ultimo valore normalizzato in memoria (`current`) e:
//   - getOverloadThresholds()   → lettura sincrona istantanea (default-safe)
//   - refreshOverloadThresholds() → ricarica dall'AppSetting (chiamata ~ogni tick
//                                    dall'history writer, sotto withBgDbSlot)
//   - saveOverloadThresholds()   → valida, persiste E aggiorna subito la cache
//                                    (usata dall'endpoint admin PUT)
//
// Prima del primo refresh la cache è = ai DEFAULT, quindi le allerte funzionano
// identiche alle vecchie costanti hardcoded anche a boot.
import { storage } from "../storage";
import { withBgDbSlot } from "./bg-db-limiter";
import { dedupWarn } from "./dedup-logger";
import {
  DEFAULT_OVERLOAD_THRESHOLDS,
  OVERLOAD_THRESHOLDS_KEY,
  normalizeOverloadThresholds,
  type OverloadThresholds,
} from "@shared/overload-thresholds";

let current: OverloadThresholds = { ...DEFAULT_OVERLOAD_THRESHOLDS };

/** Ultima config di soglie in cache (lettura sincrona, zero-I/O, default-safe). */
export function getOverloadThresholds(): OverloadThresholds {
  return current;
}

/**
 * Ricarica le soglie dall'AppSetting e aggiorna la cache. Non-fatale: se la
 * lettura fallisce la cache resta com'è (mai peggio dei default). Passa da
 * withBgDbSlot perché è una lettura di background che non deve competere col
 * traffico utente sul pool.
 */
export async function refreshOverloadThresholds(): Promise<OverloadThresholds> {
  try {
    const row = await withBgDbSlot(() => storage.getAppSetting(OVERLOAD_THRESHOLDS_KEY));
    current = normalizeOverloadThresholds(row?.valueJson ?? null);
  } catch (err) {
    dedupWarn("overload-thresholds", "refresh error (non-fatal)", err);
  }
  return current;
}

/**
 * Valida, persiste e aggiorna immediatamente la cache. La normalizzazione
 * garantisce che un payload parziale/corrotto non possa mai disabilitare le
 * allerte (ogni campo invalido ricade sul default).
 */
export async function saveOverloadThresholds(raw: unknown): Promise<OverloadThresholds> {
  const next = normalizeOverloadThresholds(raw);
  await storage.upsertAppSetting(OVERLOAD_THRESHOLDS_KEY, undefined, next);
  current = next;
  return next;
}
