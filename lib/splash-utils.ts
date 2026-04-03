import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "@/lib/query-client";

const SPLASH_INDEX_KEY = "splash_cycle_index";

export async function pickSplashMessage(): Promise<string | null> {
  try {
    const baseUrl = getApiUrl();
    const url = new URL("/api/settings/splash", baseUrl);
    const res = await fetch(url.toString(), { credentials: "include" });
    if (!res.ok) return null;
    const data = await res.json();
    const mode: string = data.mode || "single";
    if (mode === "cycle") {
      const list: string[] = Array.isArray(data.list) ? data.list.filter((m: string) => m && m.trim()) : [];
      if (list.length === 0) return data.message || null;
      const raw = await AsyncStorage.getItem(SPLASH_INDEX_KEY);
      const currentIndex = parseInt(raw || "0", 10);
      const idx = isNaN(currentIndex) ? 0 : currentIndex % list.length;
      await AsyncStorage.setItem(SPLASH_INDEX_KEY, String((idx + 1) % list.length));
      return list[idx];
    } else {
      return data.message || null;
    }
  } catch {
    return null;
  }
}
