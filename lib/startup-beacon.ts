import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { getApiUrl } from "@/lib/query-client";

const BEACON_LAST_KEY = "sb_last";
const BEACON_SENT_KEY = "sb_sent";
const API_PATH = "/api/admin/startup-beacon";

function postBeacon(payload: Record<string, unknown>): void {
  try {
    fetch(new URL(API_PATH, getApiUrl()).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {});
  } catch {}
}

export function sendStartupBeacon(step: string, data?: Record<string, unknown>): void {
  const ts = Date.now();
  const payload: Record<string, unknown> = {
    step,
    ts,
    platform: Platform.OS,
    recovered: false,
    ...(data ?? {}),
  };
  const payloadStr = JSON.stringify(payload);
  AsyncStorage.setItem(BEACON_LAST_KEY, payloadStr).catch(() => {});
  postBeacon(payload);
}

export async function recoverLastBeacon(): Promise<void> {
  try {
    const [last, sent] = await Promise.all([
      AsyncStorage.getItem(BEACON_LAST_KEY),
      AsyncStorage.getItem(BEACON_SENT_KEY),
    ]);
    if (!last || last === sent) return;
    const payload = JSON.parse(last) as Record<string, unknown>;
    const recovered = { ...payload, recovered: true };
    postBeacon(recovered);
    AsyncStorage.setItem(BEACON_SENT_KEY, last).catch(() => {});
  } catch {}
}
