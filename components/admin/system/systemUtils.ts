import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

export type AdminFetchErrorCode = "session_expired" | "forbidden" | "server_error" | "network";

export class AdminFetchError extends Error {
  code: AdminFetchErrorCode;
  status?: number;
  reason?: string;
  constructor(code: AdminFetchErrorCode, message: string, status?: number, reason?: string) {
    super(message);
    this.name = "AdminFetchError";
    this.code = code;
    this.status = status;
    this.reason = reason;
  }
}

export const isAdminError = (e: unknown): e is AdminFetchError =>
  e instanceof AdminFetchError ||
  (e instanceof Error && e.name === "AdminFetchError" && "code" in e);

export interface SystemEvent {
  timestamp: string;
  message: string;
  type: string;
}

export interface SystemHealth {
  backendStartedAt: number;
  backendUptimeSec: number;
  events: SystemEvent[];
}

export interface ServerRestart {
  id: string;
  startedAt: string;
  reason: string;
}

export interface RestartHistory {
  total: number;
  restarts: ServerRestart[];
}

export interface NativeVersionConfigData {
  android: { latestVersion: string; minVersion: string; storeUrl: string };
  ios: { latestVersion: string; minVersion: string; storeUrl: string };
}

export interface VersionDistributionRow {
  platform: string;
  version: string;
  count: number;
}

export interface VersionDistribution {
  totalTracked: number;
  underMin: number;
  underLatest: number;
  config: {
    android: { latestVersion: string; minVersion: string };
    ios: { latestVersion: string; minVersion: string };
  };
  byPlatformVersion: VersionDistributionRow[];
  windowDays: number;
  generatedAt: string;
}

export function formatDuration(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

const ROME_TZ = "Europe/Rome";

export function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", timeZone: ROME_TZ });
    const time = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: ROME_TZ });
    return `${date} ${time}`;
  } catch {
    return iso;
  }
}

export function eventIcon(type: string): { name: keyof typeof Ionicons.glyphMap; color: string } {
  switch (type) {
    case "BACKEND_RESTART":
      return { name: "refresh-circle", color: "#FF4444" };
    case "COLD_START":
      return { name: "power", color: "#44AA44" };
    case "METRO_UP":
      return { name: "wifi", color: "#44AA44" };
    case "METRO_DOWN":
      return { name: "wifi-outline", color: "#FF4444" };
    case "OTA_PUBLISHED":
      return { name: "cloud-download-outline", color: Colors.accent };
    default:
      return { name: "ellipse-outline", color: "#888888" };
  }
}

export function eventLabel(type: string, t: (key: string) => string): string {
  switch (type) {
    case "BACKEND_RESTART": return "Riavvio Backend";
    case "COLD_START": return "Avvio Freddo";
    case "METRO_UP": return "Frontend Online";
    case "METRO_DOWN": return "Frontend Offline";
    case "OTA_PUBLISHED": return t("admin.otaUpdate");
    default: return "Evento generico";
  }
}

export function platformLabel(p: string): string {
  if (p === "android") return "Android";
  if (p === "ios") return "iOS";
  if (p === "web") return "Web";
  return p;
}
