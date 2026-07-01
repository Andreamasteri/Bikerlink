import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "bowie_session_token";
const ROLE_KEY = "bowie_user_role";
const THEME_KEY = "bowie_theme";
const DEVICE_ID_KEY = "bowie_device_id";
// Task #5327 — credenziali dell'ultimo login, persistite per il prefill.
// Volutamente NON cancellate da clearSession()/logout: al reingresso il form
// arriva già compilato. Vengono sovrascritte solo da un nuovo login riuscito.
const CRED_ID_KEY = "bowie_cred_identifier";
const CRED_PW_KEY = "bowie_cred_password";

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

// Task #5327 — Credenziali dell'ultimo login riuscito (prefill del form).
export interface SavedCredentials {
  identifier: string;
  password: string;
}

export async function saveCredentials(identifier: string, password: string): Promise<void> {
  await SecureStore.setItemAsync(CRED_ID_KEY, identifier);
  await SecureStore.setItemAsync(CRED_PW_KEY, password);
}

export async function getSavedCredentials(): Promise<SavedCredentials | null> {
  const identifier = await SecureStore.getItemAsync(CRED_ID_KEY);
  const password = await SecureStore.getItemAsync(CRED_PW_KEY);
  if (!identifier || !password) return null;
  return { identifier, password };
}

export async function getSavedTheme(): Promise<string | null> {
  return SecureStore.getItemAsync(THEME_KEY);
}

export async function saveTheme(name: string): Promise<void> {
  await SecureStore.setItemAsync(THEME_KEY, name);
}
