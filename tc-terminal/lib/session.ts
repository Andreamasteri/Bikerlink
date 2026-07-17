import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "tc_session_token";
const ROLE_KEY = "tc_user_role";
const CRED_ID_KEY = "tc_cred_identifier";
const CRED_PW_KEY = "tc_cred_password";

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

export interface SavedCredentials {
  identifier: string;
  password: string;
}

export async function saveCredentials(
  identifier: string,
  password: string,
): Promise<void> {
  await SecureStore.setItemAsync(CRED_ID_KEY, identifier);
  await SecureStore.setItemAsync(CRED_PW_KEY, password);
}

export async function getSavedCredentials(): Promise<SavedCredentials | null> {
  const identifier = await SecureStore.getItemAsync(CRED_ID_KEY);
  const password = await SecureStore.getItemAsync(CRED_PW_KEY);
  if (!identifier || !password) return null;
  return { identifier, password };
}
