import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "bowie_session_token";
const ROLE_KEY = "bowie_user_role";
const THEME_KEY = "bowie_theme";
const DEVICE_ID_KEY = "bowie_device_id";

export async function saveSession(token: string, role: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  await SecureStore.setItemAsync(ROLE_KEY, role);
}

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function getRole(): Promise<string | null> {
  return SecureStore.getItemAsync(ROLE_KEY);
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(ROLE_KEY);
}

// Task #5228 — Identificatore stabile del dispositivo, generato una volta e
// persistito. Serve al monitor admin per elencare/revocare i singoli device
// (NO pacchetto uuid: crasha su iOS/Android per mancanza di crypto).
export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) return existing;
  const id = `bt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 11)}`;
  await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
  return id;
}

export async function getSavedTheme(): Promise<string | null> {
  return SecureStore.getItemAsync(THEME_KEY);
}

export async function saveTheme(name: string): Promise<void> {
  await SecureStore.setItemAsync(THEME_KEY, name);
}
