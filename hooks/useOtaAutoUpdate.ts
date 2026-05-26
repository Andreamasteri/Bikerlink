import { useEffect, useRef } from "react";
import * as Updates from "expo-updates";
import { Platform } from "react-native";

/**
 * Auto-update OTA al primo avvio dell'app.
 *
 * Su Android/iOS in build production:
 *   - Controlla se è disponibile una nuova OTA sul canale production
 *   - La scarica e ricarica il bundle automaticamente (l'utente vede solo un riavvio)
 *
 * Su Expo Go / web / dev: no-op.
 *
 * Restituisce { checking } per eventuale UI di splash. Il riavvio interrompe
 * comunque il flusso, quindi nessun ulteriore handling è necessario.
 */
export function useOtaAutoUpdate(): { checking: boolean } {
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    if (Platform.OS === "web") return;
    if (!Updates.isEnabled) return;
    if (__DEV__) return;

    (async () => {
      try {
        const check = await Updates.checkForUpdateAsync();
        if (!check.isAvailable) return;

        const result = await Updates.fetchUpdateAsync();
        if (result.isNew) {
          await Updates.reloadAsync();
        }
      } catch (err) {
        console.warn("[useOtaAutoUpdate] OTA check/fetch failed:", err);
      }
    })();
  }, []);

  return { checking: false };
}
