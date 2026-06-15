import { useState, useEffect } from "react";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import * as SplashScreen from "expo-splash-screen";
import { sendStartupBeacon, recoverLastBeacon } from "@/lib/startup-beacon";
import { purgeLegacyGpsBuffer } from "@/lib/storage-recovery";
import { initSessionToken } from "@/lib/query-client";

export function useAppBootstrap() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const [ready, setReady] = useState(false);
  const [tokenReady, setTokenReady] = useState(false);

  useEffect(() => {
    (async () => {
      // initSessionToken DEVE essere la primissima operazione: useOtaAutoUpdate
      // e DeviceMetricsReporter vengono montati subito dopo e devono trovare il
      // token già in cache per non inviare richieste anonime al cold start.
      await initSessionToken();
      setTokenReady(true);
      await recoverLastBeacon();
      sendStartupBeacon("layout_mount");
      // Recovery storage saturato dal vecchio buffer GPS offline (mappa nera,
      // campagne nere, upload immagine → freeze). Gira al boot così i device
      // già intasati si auto-riparano via OTA senza perdere dati né login.
      const purged = await purgeLegacyGpsBuffer();
      if (purged > 0) {
        sendStartupBeacon("legacy_gps_buffer_purged", { keys: purged });
      }
    })();
  }, []);

  useEffect(() => {
    const forceReady = () => {
      setReady(true);
      SplashScreen.hideAsync().catch(() => {});
    };

    const timeout = setTimeout(forceReady, 5000);

    if (fontsLoaded || fontError) {
      sendStartupBeacon("fonts_ready");
      clearTimeout(timeout);
      forceReady();
    }

    return () => clearTimeout(timeout);
  }, [fontsLoaded, fontError]);

  return { ready, tokenReady, fontsLoaded, fontError };
}
