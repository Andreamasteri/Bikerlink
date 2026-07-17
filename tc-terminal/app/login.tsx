import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { getSavedCredentials, saveCredentials, saveSession } from "../lib/session";
import { THEME } from "../constants/theme";

const DOMAIN = process.env.EXPO_PUBLIC_DOMAIN || "bikerlink.replit.app";

async function loginTc(
  tcUsername: string,
  tcPassword: string,
): Promise<{ token: string }> {
  const res = await fetch(`https://${DOMAIN}/api/ssh/terminal/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tcUsername, tcPassword }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    token?: string;
    error?: string;
    message?: string;
  };
  if (!res.ok) {
    throw new Error(json.error ?? json.message ?? "Credenziali non valide");
  }
  if (!json.token) {
    throw new Error("Token non ricevuto dal server");
  }
  return { token: json.token };
}

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const [tcUsername, setTcUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const creds = await getSavedCredentials();
      if (creds) {
        setTcUsername(creds.identifier);
        setPassword(creds.password);
      }
    })();
  }, []);

  const onSubmit = useCallback(async () => {
    if (busy) return;
    if (!tcUsername.trim() || !password) {
      setError("Inserisci utente TC e password");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await loginTc(tcUsername.trim(), password);
      await saveSession(res.token, "tc");
      await saveCredentials(tcUsername.trim(), password);
      router.replace("/");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }, [busy, tcUsername, password]);

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: THEME.background, paddingTop: topInset + 48 },
      ]}
    >
      <View style={styles.brand}>
        <View style={[styles.avatar, { backgroundColor: THEME.accentDim }]}>
          <Ionicons name="terminal" size={26} color={THEME.accent} />
        </View>
        <Text style={[styles.title, { color: THEME.accent }]}>TC Terminal</Text>
        <Text style={[styles.subtitle, { color: THEME.textSecondary }]}>
          ThinkCentre SSH
        </Text>
      </View>

      <View style={styles.form}>
        <Text style={[styles.label, { color: THEME.textSecondary }]}>
          Utente TC
        </Text>
        <TextInput
          value={tcUsername}
          onChangeText={setTcUsername}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
          style={[
            styles.input,
            {
              color: THEME.inputText,
              backgroundColor: THEME.input,
              borderColor: THEME.border,
            },
          ]}
          placeholder="andrea"
          placeholderTextColor={THEME.textSecondary}
          returnKeyType="next"
          testID="login-identifier"
        />

        <Text
          style={[styles.label, { color: THEME.textSecondary, marginTop: 16 }]}
        >
          Password TC
        </Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
          onSubmitEditing={onSubmit}
          style={[
            styles.input,
            {
              color: THEME.inputText,
              backgroundColor: THEME.input,
              borderColor: THEME.border,
            },
          ]}
          placeholder="••••••••"
          placeholderTextColor={THEME.textSecondary}
          returnKeyType="go"
          testID="login-password"
        />

        {error ? (
          <View style={styles.errorRow}>
            <Ionicons name="alert-circle" size={16} color={THEME.error} />
            <Text style={[styles.err, { color: THEME.error }]}>{error}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={onSubmit}
          disabled={busy}
          style={({ pressed }) => [
            styles.btn,
            {
              backgroundColor: THEME.accentDim,
              borderColor: THEME.accent,
              opacity: pressed || busy ? 0.7 : 1,
            },
          ]}
          testID="login-submit"
        >
          {busy ? (
            <ActivityIndicator color={THEME.accent} />
          ) : (
            <Text style={[styles.btnText, { color: THEME.accent }]}>
              Connetti
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 24 },
  brand: { alignItems: "center", marginBottom: 40 },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#007A20",
  },
  title: { fontSize: 28, fontWeight: "700", letterSpacing: 2, fontFamily: "monospace" },
  subtitle: { fontSize: 13, marginTop: 6 },
  form: {},
  label: { fontSize: 13, fontWeight: "600", marginBottom: 8, marginLeft: 2 },
  input: {
    height: 50,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    fontSize: 16,
    fontFamily: "monospace",
  },
  errorRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 14 },
  err: { fontSize: 14, flex: 1 },
  btn: {
    marginTop: 28,
    height: 52,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { fontSize: 17, fontWeight: "700", letterSpacing: 1, fontFamily: "monospace" },
});
