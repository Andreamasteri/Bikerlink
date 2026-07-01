import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "bowie_session_token";
const ROLE_KEY = "bowie_user_role";
const THEME_KEY = "bowie_theme";

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

export async function getSavedTheme(): Promise<string | null> {
  return SecureStore.getItemAsync(THEME_KEY);
}

export async function saveTheme(name: string): Promise<void> {
  await SecureStore.setItemAsync(THEME_KEY, name);
}
