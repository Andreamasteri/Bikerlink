import { Platform } from "react-native";

// Safe lazy require: build 53 non ha il modulo nativo expo-device.
// Import top-level crasherebbe l'intero bundle JS (schermata nera).
// In build futuri con il modulo nativo, Device sarà popolato correttamente.
let Device: { modelName?: string | null; manufacturer?: string | null } = {};
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  Device = require("expo-device");
} catch {
  Device = {};
}

const ANDROID_MODEL_MAP: Record<string, string> = {
  "SM-S911B": "Samsung Galaxy S23",
  "SM-S916B": "Samsung Galaxy S23+",
  "SM-S918B": "Samsung Galaxy S23 Ultra",
  "SM-S921B": "Samsung Galaxy S24",
  "SM-S926B": "Samsung Galaxy S24+",
  "SM-S928B": "Samsung Galaxy S24 Ultra",
  "SM-S931B": "Samsung Galaxy S25",
  "SM-S936B": "Samsung Galaxy S25+",
  "SM-S938B": "Samsung Galaxy S25 Ultra",
  "SM-A546B": "Samsung Galaxy A54",
  "SM-A336B": "Samsung Galaxy A33",
  "SM-A156B": "Samsung Galaxy A15",
  "SM-G998B": "Samsung Galaxy S21 Ultra",
  "SM-G996B": "Samsung Galaxy S21+",
  "SM-G991B": "Samsung Galaxy S21",
  "SM-G973F": "Samsung Galaxy S10",
  "SM-G975F": "Samsung Galaxy S10+",
  "SM-N986B": "Samsung Galaxy Note 20 Ultra",
  "SM-F946B": "Samsung Galaxy Z Fold5",
  "SM-F731B": "Samsung Galaxy Z Flip5",
  "Pixel 6": "Google Pixel 6",
  "Pixel 6a": "Google Pixel 6a",
  "Pixel 6 Pro": "Google Pixel 6 Pro",
  "Pixel 7": "Google Pixel 7",
  "Pixel 7a": "Google Pixel 7a",
  "Pixel 7 Pro": "Google Pixel 7 Pro",
  "Pixel 8": "Google Pixel 8",
  "Pixel 8a": "Google Pixel 8a",
  "Pixel 8 Pro": "Google Pixel 8 Pro",
  "Pixel 9": "Google Pixel 9",
  "Pixel 9 Pro": "Google Pixel 9 Pro",
  "23113RKC6G": "Xiaomi 13T Pro",
  "23078RKD5X": "Xiaomi 13T",
  "2312DRK54G": "Xiaomi 14",
  "CPH2609": "OnePlus 12",
  "CPH2449": "OnePlus 11",
  "PJZ110": "OnePlus 10 Pro",
  "VOG-L29": "Huawei Mate 20 Pro",
  "ELS-NX9": "Huawei P40 Pro",
};

function getWebDeviceString(): string | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  if (!ua) return null;

  const isMac = /Macintosh|MacIntel/.test(ua);
  const isWindows = /Windows NT/.test(ua);
  const isLinux = /Linux/.test(ua) && !/Android/.test(ua);
  const isAndroidWeb = /Android/.test(ua);
  const isIPhoneWeb = /iPhone/.test(ua);
  const isIPadWeb = /iPad/.test(ua);

  let os = "Unknown OS";
  if (isMac) os = "macOS";
  else if (isWindows) os = "Windows";
  else if (isLinux) os = "Linux";
  else if (isAndroidWeb) os = "Android";
  else if (isIPhoneWeb) os = "iPhone";
  else if (isIPadWeb) os = "iPad";

  let browser = "Browser";
  if (/Chrome\//.test(ua) && !/Chromium\//.test(ua) && !/Edg\//.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) browser = "Safari";
  else if (/Edg\//.test(ua)) browser = "Edge";

  return `${browser} on ${os}`;
}

export function getDeviceModel(): string | null {
  if (Platform.OS === "web") {
    return getWebDeviceString();
  }

  const modelName = Device.modelName ?? null;
  const manufacturer = Device.manufacturer ?? null;

  if (Platform.OS === "ios") {
    return modelName;
  }

  if (Platform.OS === "android") {
    if (modelName) {
      const mapped = ANDROID_MODEL_MAP[modelName];
      if (mapped) return mapped;
      if (manufacturer) {
        return `${manufacturer} ${modelName}`;
      }
      return modelName;
    }
    return manufacturer ?? null;
  }

  return null;
}
