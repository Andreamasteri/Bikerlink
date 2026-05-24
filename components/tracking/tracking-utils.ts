import { SpeedUnit, DistanceUnit } from "@/lib/units-context";
import Colors from "@/constants/colors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { buildLeafletPostRideHtml } from "@/lib/leaflet-route-map-html";

export type UpdateProfile = "easy" | "medium" | "race";

export interface BatteryDrainStats {
  easy: number[];
  medium: number[];
  race: number[];
}

export function formatHMS(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function getAccuracyTier(meters: number | null): { labelKey: string; color: string; value: string } | null {
  if (meters === null || meters < 0) return null;
  const m = Math.round(meters);
  if (meters < 5) return { labelKey: "tracking.accuracy.excellent", color: Colors.success, value: `${m}m` };
  if (meters < 15) return { labelKey: "tracking.accuracy.good", color: "#4A9EFF", value: `${m}m` };
  if (meters <= 30) return { labelKey: "tracking.accuracy.fair", color: Colors.warning, value: `${m}m` };
  return { labelKey: "tracking.accuracy.poor", color: Colors.accentRed, value: `${m}m` };
}

export function convertSpeed(kmh: number, unit: SpeedUnit): number {
  if (unit === "mph") return kmh * 0.621371;
  if (unit === "knots") return kmh * 0.539957;
  return kmh;
}

export function speedUnitLabel(unit: SpeedUnit): string {
  if (unit === "mph") return "mph";
  if (unit === "knots") return "kn";
  return "km/h";
}

export function convertDistance(km: number, unit: DistanceUnit): number {
  if (unit === "mi_ft" || unit === "mi_yd") return km * 0.621371;
  if (unit === "nmi_ftm") return km * 0.539957;
  return km;
}

export function distanceUnitLabel(unit: DistanceUnit): string {
  if (unit === "mi_ft" || unit === "mi_yd") return "mi";
  if (unit === "nmi_ftm") return "nmi";
  return "km";
}

export function getStaticBatteryDrainPerHour(profile: UpdateProfile): number {
  if (profile === "race") return 9;
  if (profile === "easy") return 3;
  return 5;
}

export const BATTERY_DRAIN_STATS_KEY = "@bikerlink/battery_drain_stats_v1";
export const BATTERY_MIN_RIDE_MINUTES = 5;
export const BATTERY_MAX_SAMPLES = 10;

export function normalizeBatteryDrainStats(raw: unknown): BatteryDrainStats {
  const isNumArr = (v: unknown): v is number[] =>
    Array.isArray(v) && v.every((x) => typeof x === "number" && isFinite(x));
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const r = raw as Record<string, unknown>;
    return {
      easy: isNumArr(r.easy) ? r.easy : [],
      medium: isNumArr(r.medium) ? r.medium : [],
      race: isNumArr(r.race) ? r.race : [],
    };
  }
  return { easy: [], medium: [], race: [] };
}

export async function loadBatteryDrainStats(): Promise<BatteryDrainStats> {
  try {
    const raw = await AsyncStorage.getItem(BATTERY_DRAIN_STATS_KEY);
    if (raw) return normalizeBatteryDrainStats(JSON.parse(raw));
  } catch {
    // console.warn("[BikerLink] loadBatteryDrainStats error");
  }
  return { easy: [], medium: [], race: [] };
}

export async function appendBatteryDrainSample(
  profile: UpdateProfile,
  drainPerHour: number
): Promise<BatteryDrainStats> {
  const stats = await loadBatteryDrainStats();
  const arr = [...stats[profile], drainPerHour].slice(-BATTERY_MAX_SAMPLES);
  const updated: BatteryDrainStats = { ...stats, [profile]: arr };
  try {
    await AsyncStorage.setItem(BATTERY_DRAIN_STATS_KEY, JSON.stringify(updated));
  } catch {
    // console.warn("[BikerLink] appendBatteryDrainSample persist error");
  }
  return updated;
}

export function getMeasuredDrainPerHour(stats: BatteryDrainStats, profile: UpdateProfile): number | null {
  const samples = stats[profile];
  if (samples.length === 0) return null;
  return samples.reduce((a, b) => a + b, 0) / samples.length;
}

export { buildLeafletPostRideHtml };
