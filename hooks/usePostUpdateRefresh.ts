import { useState, useEffect } from "react";
import { RUNTIME_VERSION } from "@/constants/buildInfo";
import { loadLastKnownVersion, saveLastKnownVersion } from "@/lib/versionStorage";
import { queryClient } from "@/lib/query-client";

/**
 * Al primo avvio dopo un aggiornamento (o installazione fresca), resetta la cache
 * React Query per forzare il re-fetch dei dati essenziali dal server.
 *
 * Confronta RUNTIME_VERSION con la versione salvata in AsyncStorage.
 * Se differiscono (o la chiave non esiste), esegue queryClient.resetQueries()
 * e aggiorna il valore salvato con la versione corrente.
 *
 * In tutti gli altri avvii normali non fa nulla.
 */
export function usePostUpdateRefresh(): { isRefreshing: boolean } {
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const lastVersion = await loadLastKnownVersion();

        if (lastVersion !== RUNTIME_VERSION) {
          if (!cancelled) setIsRefreshing(true);

          await queryClient.resetQueries();
          await saveLastKnownVersion(RUNTIME_VERSION);

          if (!cancelled) setIsRefreshing(false);
        }
      } catch (err) {
        console.warn("[usePostUpdateRefresh] version check/reset failed:", err);
        if (!cancelled) setIsRefreshing(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  return { isRefreshing };
}
