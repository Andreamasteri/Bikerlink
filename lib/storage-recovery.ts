import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Recovery una-tantum dello storage locale saturato dal vecchio buffer GPS
 * offline (funzione rimossa). Il buffer ring scriveva segmenti
 * `@bikerlink/gps_buffer_seg_*` a ogni fix GPS senza mai rileggerli: su ride
 * lunghe saturava AsyncStorage (SQLITE_FULL), e l'errore propagato rompeva la
 * mappa (mappa nera), le immagini delle campagne e qualunque scrittura su
 * storage (es. upload immagine → freeze).
 *
 * Rimuovere il codice che scriveva il buffer NON libera lo storage già pieno
 * sui device esistenti. Questa funzione gira al boot dell'app e cancella TUTTE
 * le chiavi legacy (con prefisso, non solo 0..49) così i device intasati si
 * auto-riparano via OTA senza che l'utente debba cancellare dati o rifare login.
 *
 * Fire-and-forget, idempotente, mai lancia eccezioni.
 */
const GPS_BUFFER_SEG_PREFIX = "@bikerlink/gps_buffer_seg";
const GPS_BUFFER_SEGCOUNT_KEY = "@bikerlink/gps_buffer_segcount";

export async function purgeLegacyGpsBuffer(): Promise<number> {
  try {
    const keys = [...(await AsyncStorage.getAllKeys())] as string[];
    const stale = keys.filter(
      (k) => k === GPS_BUFFER_SEGCOUNT_KEY || k.startsWith(GPS_BUFFER_SEG_PREFIX)
    );
    if (stale.length > 0) {
      await AsyncStorage.removeMany(stale);
    }
    return stale.length;
  } catch {
    return 0;
  }
}
