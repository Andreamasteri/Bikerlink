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
import { login } from "../lib/bowie-client";
import { getSavedCredentials, saveCredentials, saveSession } from "../lib/session";
import { THEMES } from "../constants/theme";

// Pre-auth: usa sempre il tema di default (attuale).
const t = THEMES.attuale;

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Task #5327 — prefill dell'ultimo login riuscito (creds in SecureStore).
  useEffect(() => {
    (async () => {
      const creds = await getSavedCredentials();
      if (creds) {
        setIdentifier(creds.identifier);
        setPassword(creds.password);
      }
    })();
  }, []);

  const onSubmit = useCallback(async () => {
    if (busy) return;
    if (!identifier.trim() || !password) {
      setError("Inserisci email/nickname e password");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await login(identifier.trim(), password);
      await saveSession(res.token, res.role);
      // Task #5327 — salva le credenziali per il prossimo prefill (non cancellate al logout).
      await saveCredentials(identifier.trim(), password);
      router.replace("/");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }, [busy, identifier, password]);

  return (
    <View style={[styles.root, { backgroundColor: t.background, paddingTop: topInset + 48 }]}>
      <View style={styles.brand}>
        <View style={[styles.avatar, { backgroundColor: t.bowie }]}>
          <Ionicons name="sparkles" size={26} color={t.accentText} />
        </View>
        <Text style={[styles.title, { color: t.text }]}>Bowie</Text>
        <Text style={[styles.subtitle, { color: t.textSecondary }]}>
          Il tuo assistente BikerLink
        </Text>
      </View>

      <View style={styles.form}>
        <Text style={[styles.label, { color: t.textSecondary }]}>Email o nickname</Text>
        <TextInput
          value={identifier}
          onChangeText={setIdentifier}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
          style={[styles.input, { color: t.text, backgroundColor: t.surface, borderColor: t.border }]}
          placeholder="tu@esempio.com"
          placeholderTextColor={t.textSecondary}
          returnKeyType="next"
          testID="login-identifier"
        />

        <Text style={[styles.label, { color: t.textSecondary, marginTop: 16 }]}>Password</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
          onSubmitEditing={onSubmit}
          style={[styles.input, { color: t.text, backgroundColor: t.surface, borderColor: t.border }]}
          placeholder="••••••••"
          placeholderTextColor={t.textSecondary}
          returnKeyType="go"
          testID="login-password"
        />

        {error ? (
          <View style={styles.errorRow}>
            <Ionicons name="alert-circle" size={16} color={t.error} />
            <Text style={[styles.err, { color: t.error }]}>{error}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={onSubmit}
          disabled={busy}
          style={({ pressed }) => [
            styles.btn,
            { backgroundColor: t.bowie, opacity: pressed || busy ? 0.7 : 1 },
          ]}
          testID="login-submit"
        >
          {busy ? (
            <ActivityIndicator color={t.accentText} />
          ) : (
            <Text style={[styles.btnText, { color: t.accentText }]}>Entra</Text>
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
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: { fontSize: 30, fontWeight: "700", letterSpacing: 0.3 },
  subtitle: { fontSize: 14, marginTop: 6 },
  form: {},
  label: { fontSize: 13, fontWeight: "600", marginBottom: 8, marginLeft: 2 },
  input: {
    height: 50,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  errorRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 14 },
  err: { fontSize: 14, flex: 1 },
  btn: {
    marginTop: 28,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { fontSize: 17, fontWeight: "700", letterSpacing: 0.3 },
});
