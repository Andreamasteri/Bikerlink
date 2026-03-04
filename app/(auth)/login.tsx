import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/lib/auth-context";
import Colors from "@/constants/colors";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const insets = useSafeAreaInsets();

  const showError = (title: string, message: string) => {
    if (Platform.OS === "web") {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const handleLogin = async () => {
    if (!identifier || !password) {
      showError("Errore", "Inserisci email/username e password");
      return;
    }

    setLoading(true);
    try {
      await login(identifier.trim().toLowerCase(), password);
      router.replace("/(tabs)");
    } catch (err: any) {
      const msg = err.message || "Errore nel login";
      const parsed = msg.includes(":") ? msg.split(": ").slice(1).join(": ") : msg;
      let errorMsg = "Credenziali non valide";
      try {
        const json = JSON.parse(parsed);
        errorMsg = json.message || errorMsg;
      } catch {
        errorMsg = parsed || errorMsg;
      }
      showError("Errore", errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 16 }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>BikerLink</Text>
      <Text style={styles.subtitle}>Accedi al tuo account</Text>

      <View style={styles.form}>
        <Text style={styles.label}>Email o Username</Text>
        <TextInput
          style={styles.input}
          placeholder="email o username"
          placeholderTextColor={Colors.textSecondary}
          value={identifier}
          onChangeText={setIdentifier}
          autoCapitalize="none"
        />

        <Text style={styles.label}>Password</Text>
        <View style={styles.passwordContainer}>
          <TextInput
            style={styles.passwordInput}
            placeholder="La tua password"
            placeholderTextColor={Colors.textSecondary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            textContentType="password"
          />
          <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}>
            <Ionicons name={showPassword ? "eye-off" : "eye"} size={22} color={Colors.textSecondary} />
          </Pressable>
        </View>

        <Pressable style={styles.button} onPress={handleLogin} disabled={loading}>
          {loading ? (
            <ActivityIndicator color={Colors.background} />
          ) : (
            <Text style={styles.buttonText}>Accedi</Text>
          )}
        </Pressable>

        <Pressable onPress={() => router.push("/(auth)/forgot-password")}>
          <Text style={styles.linkText}>Password dimenticata?</Text>
        </Pressable>

        <Pressable onPress={() => router.push("/(auth)/register")}>
          <Text style={styles.linkText}>Non hai un account? Registrati</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 24, justifyContent: "center", flexGrow: 1 },
  title: { fontSize: 36, fontFamily: "Inter_700Bold", color: Colors.accent, textAlign: "center" },
  subtitle: { fontSize: 16, fontFamily: "Inter_400Regular", color: Colors.textSecondary, textAlign: "center", marginTop: 8, marginBottom: 32 },
  form: { gap: 12 },
  label: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.text },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
  },
  passwordContainer: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
  },
  passwordInput: {
    flex: 1,
    padding: 14,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
  },
  eyeButton: {
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  button: {
    backgroundColor: Colors.accent,
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.background },
  linkText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.accent, textAlign: "center", marginTop: 8 },
});
