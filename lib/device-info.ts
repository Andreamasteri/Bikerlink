import { Platform } from "react-native";
import Constants from "expo-constants";
import { getDeviceModel } from "@/lib/device-model";

export type DeviceInfoPayload = {
  model: string | null;
  platform: string | null;
  osVersion: string | null;
  appVersion: string | null;
};

export function collectDeviceInfo(): DeviceInfoPayload {
  const model = getDeviceModel();
  const platform = Platform.OS ?? null;
  const osVersion = Platform.Version != null ? String(Platform.Version) : null;
  const appVersion = Constants.expoConfig?.version ?? null;
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
