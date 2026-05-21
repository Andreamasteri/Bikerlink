import { useState, useEffect } from "react";
import { Platform } from "react-native";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import * as SplashScreen from "expo-splash-screen";
import { isOtaStuck } from "@/lib/ota-stuck";
import { sendStartupBeacon, recoverLastBeacon } from "@/lib/startup-beacon";

export function useAppBootstrap() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const [ready, setReady] = useState(false);
  const [otaStuck, setOtaStuck] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      await recoverLastBeacon();
      sendStartupBeacon("layout_mount");
    })();
  }, []);

  useEffect(() => {
    const forceReady = async () => {
      if (!__DEV__) {
        try {
          const stuck = await isOtaStuck();
          setOtaStuck(stuck);
        } catch {
          setOtaStuck(false);
        }
      } else {
        setOtaStuck(false);
      }
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

  return { ready, otaStuck, setOtaStuck, fontsLoaded, fontError };
}
