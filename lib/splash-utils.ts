import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "@/lib/query-client";

const SPLASH_INDEX_KEY = "splash_cycle_index";

export async function pickSplashMessage(): Promise<string | null> {
  const raw = await AsyncStorage.getItem(SPLASH_INDEX_KEY).catch(() => "0");
  const currentIndex = parseInt(raw || "0", 10);
  const safeIndex = isNaN(currentIndex) ? 0 : currentIndex;

  try {
    const baseUrl = getApiUrl();
    const url = new URL("/api/settings/splash", baseUrl);
    const res = await fetch(url.toString(), { credentials: "include" });
    if (!res.ok) {
      await AsyncStorage.setItem(SPLASH_INDEX_KEY, String(safeIndex + 1)).catch(() => {});
      return null;
    }
    const data = await res.json();
    const mode: string = data.mode || "single";
    if (mode === "cycle") {
      const list: string[] = Array.isArray(data.list) ? data.list.filter((m: string) => m && m.trim()) : [];
      if (list.length === 0) {
        await AsyncStorage.setItem(SPLASH_INDEX_KEY, String(safeIndex + 1)).catch(() => {});
        return data.message || null;
      }
      const idx = safeIndex % list.length;
      await AsyncStorage.setItem(SPLASH_INDEX_KEY, String((idx + 1) % list.length)).catch(() => {});
      return list[idx];
    } else {
      return data.message || null;
    }
  } catch {
    await AsyncStorage.setItem(SPLASH_INDEX_KEY, String(safeIndex + 1)).catch(() => {});
    return null;
  }
}
