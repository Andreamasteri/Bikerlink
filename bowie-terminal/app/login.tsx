import { useCallback, useState } from "react";
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
import { router } from "expo-router";
import { login } from "../lib/bowie-client";
import { saveSession } from "../lib/session";
import { THEMES } from "../constants/theme";

// Pre-auth: usa sempre il tema di default (attuale).
const t = THEMES.attuale;
const MONO = Platform.select({ ios: "Menlo", default: "monospace" });

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      router.replace("/");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }, [busy, identifier, password]);

  return (
    <View style={[styles.root, { backgroundColor: t.background, paddingTop: topInset + 28 }]}>
      <Text style={[styles.header, { color: t.border }]}>BOWIE TERMINAL v1.0</Text>
      <Text style={[styles.sub, { color: t.textSecondary }]}>
        connecting · biker-link.replit.app · ok
      </Text>
      <Text style={[styles.sep, { color: t.border }]}>
        ────────────────────────────────────────
      </Text>

      <View style={styles.row}>
        <Text style={[styles.label, { color: t.bowie }]}>LOGIN: </Text>
        <TextInput
          value={identifier}
          onChangeText={setIdentifier}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
          style={[styles.input, { color: t.text }]}
          placeholder="_"
          placeholderTextColor={t.textSecondary}
          returnKeyType="next"
          testID="login-identifier"
        />
      </View>

      <View style={styles.row}>
        <Text style={[styles.label, { color: t.bowie }]}>PASSWORD: </Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
          onSubmitEditing={onSubmit}
          style={[styles.input, { color: t.text }]}
          placeholder="_"
          placeholderTextColor={t.textSecondary}
          returnKeyType="go"
          testID="login-password"
        />
      </View>

      {error ? <Text style={[styles.err, { color: t.error }]}>! {error}</Text> : null}

      <Pressable
        onPress={onSubmit}
        disabled={busy}
        style={({ pressed }) => [styles.btn, { opacity: pressed || busy ? 0.6 : 1 }]}
        testID="login-submit"
      >
        {busy ? (
          <ActivityIndicator color={t.bowie} />
        ) : (
          <Text style={[styles.btnText, { color: t.bowie }]}>› CONNECT</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 16 },
  header: { fontFamily: MONO, fontSize: 14, letterSpacing: 1 },
  sub: { fontFamily: MONO, fontSize: 12, marginTop: 4 },
  sep: { fontFamily: MONO, fontSize: 12, marginVertical: 14 },
  row: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  label: { fontFamily: MONO, fontSize: 14, fontWeight: "bold" },
  input: { flex: 1, fontFamily: MONO, fontSize: 14, paddingVertical: 4 },
  err: { fontFamily: MONO, fontSize: 13, marginTop: 8 },
  btn: { marginTop: 24, alignSelf: "flex-start", paddingVertical: 8, paddingHorizontal: 4 },
  btnText: { fontFamily: MONO, fontSize: 16, fontWeight: "bold", letterSpacing: 1 },
});
