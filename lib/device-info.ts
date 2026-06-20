import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Application from "expo-application";
import { getDeviceModel } from "@/lib/device-model";

export type DeviceInfoPayload = {
  model: string | null;
  platform: string | null;
  osVersion: string | null;
  appVersion: string | null;
};

/**
 * Versione affidabile dell'app da segnalare al backend.
 * Priorità a `expo-application` (`nativeApplicationVersion`), che legge la
 * versione "cotta" nel binario nativo dell'APK ed è affidabile a runtime in
 * produzione. `Constants.expoConfig?.version` è solo un ripiego: in un APK di
 * produzione può essere nullo (→ il server lo sanifica a "unknown") o riflettere
 * un manifest non corretto. Fallback finale "0.0.0" per non inviare mai vuoto.
 */
export function getReliableAppVersion(): string {
  const native = Application.nativeApplicationVersion;
  if (typeof native === "string" && native.trim().length > 0) {
    return native.trim();
  }
  const config = Constants.expoConfig?.version;
  if (typeof config === "string" && config.trim().length > 0) {
    return config.trim();
  }
  return "0.0.0";
}

export function collectDeviceInfo(): DeviceInfoPayload {
  const model = getDeviceModel();
  const platform = Platform.OS ?? null;
  const osVersion = Platform.Version != null ? String(Platform.Version) : null;
  const appVersion = getReliableAppVersion();
  return {
    model: model ?? null,
    platform,
    osVersion,
    appVersion,
  };
}

export function formatDeviceInfo(d?: Partial<DeviceInfoPayload> | null): string {
  if (!d) return "—";
  const parts: string[] = [];
  if (d.model) parts.push(d.model);
  const os = [d.platform, d.osVersion].filter(Boolean).join(" ");
  if (os) parts.push(os);
  if (d.appVersion) parts.push(`v${d.appVersion}`);
  return parts.length > 0 ? parts.join(" · ") : "—";
}
