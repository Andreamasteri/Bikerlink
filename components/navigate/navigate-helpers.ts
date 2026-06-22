import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import type { NavigationStep, PlannedRoute } from "@/components/navigate/navigate-types";

// ─── Route cache helpers ───────────────────────────────────────────────────────

const ROUTE_CACHE_PREFIX = "route_cache_";

export async function saveRouteToCache(route: PlannedRoute): Promise<void> {
  try {
    await AsyncStorage.setItem(
      `${ROUTE_CACHE_PREFIX}${route.id}`,
      JSON.stringify(route)
    );
  } catch {
    // no-op: route caching is best-effort
  }
}

export async function loadRouteFromCache(id: string): Promise<PlannedRoute | null> {
  try {
    const raw = await AsyncStorage.getItem(`${ROUTE_CACHE_PREFIX}${id}`);
    if (!raw) return null;
    return JSON.parse(raw) as PlannedRoute;
  } catch {
    // no-op: cache retrieval is best-effort
    return null;
  }
}

// ─── Navigation helpers ───────────────────────────────────────────────────────

export function activeStepIndex(polylineIdx: number, steps: NavigationStep[]): number {
  for (let i = steps.length - 1; i >= 0; i--) {
    if (polylineIdx >= steps[i].interval[0]) return i;
  }
  return 0;
}

export function signToIcon(sign: number): keyof typeof Ionicons.glyphMap {
  switch (sign) {
    case -3: return "return-down-back-outline";
    case -2: return "arrow-back-outline";
    case -1: return "arrow-back-circle-outline";
    case 0: return "arrow-up-outline";
    case 1: return "arrow-forward-circle-outline";
    case 2: return "arrow-forward-outline";
    case 3: return "return-down-forward-outline";
    case 4: return "flag-outline";
    case 6: return "refresh-outline";
    default: return "navigate-outline";
  }
}

export function formatDistance(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m)} m`;
}

export function formatDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}
