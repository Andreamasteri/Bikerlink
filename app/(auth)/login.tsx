import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { t } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { getApiUrl } from "@/lib/query-client";

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { loginMutation } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async () => {
    setError("");
    if (!identifier.trim() || !password) {
      setError(t("auth.enterCredentials"));
      return;
    }
    setIsSubmitting(true);
    let gpsCoords: { latitude: number; longitude: number } | undefined;
    try {
      const Location = require('expo-location');
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const pos = await Promise.race([
          Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
        ]);
        if (pos) {
          gpsCoords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        }
      }
    } catch {}
    loginMutation.mutate(
      { identifier: identifier.trim(), password, ...gpsCoords },
      {
        onSuccess: async () => {
          setIsSubmitting(false);
          try {
            const ctrl = new AbortController();
            const timeout = setTimeout(() => ctrl.abort(), 3000);
            const res = await fetch(new URL("/api/settings/ota-gate-enabled", getApiUrl()).toString(), { signal: ctrl.signal });
            clearTimeout(timeout);
            const data = await res.json();
            if (data?.enabled === true) {
              router.replace("/ota-gate");
              return;
            }
          } catch {}
          router.replace("/(tabs)");
        },
        onError: (err: any) => {
          setIsSubmitting(false);
          const msg = err?.message || t("auth.loginError");
          const cleaned = msg.replace(/^\d+:\s*/, "");
          try {
            const parsed = JSON.parse(cleaned);
            setError(parsed.message || cleaned);
          } catch {
            setError(cleaned);
          }
        },
      }
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          {
            paddingTop: insets.top + 40,
            paddingBottom: insets.bottom + 20,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logoContainer}>
          <Ionicons name="bicycle" size={64} color={Colors.accent} />
          <Text style={styles.appName}>{t("app.name")}</Text>
          <Text style={styles.tagline}>{t("app.tagline")}</Text>
        </View>

        <View style={styles.formContainer}>
          {error ? (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={18} color={Colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.inputWrapper}>
            <Ionicons name="person-outline" size={20} color={Colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder={t("auth.emailOrNickname")}
              placeholderTextColor={Colors.textSecondary}
              value={identifier}
              onChangeText={setIdentifier}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              testID="login-identifier"
            />
          </View>

          <View style={styles.inputWrapper}>
            <Ionicons name="lock-closed-outline" size={20} color={Colors.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, styles.passwordInput]}
              placeholder={t("auth.password")}
              placeholderTextColor={Colors.textSecondary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              textContentType="password"
              autoComplete="password"
              testID="login-password"
            />
            <TouchableOpacity
              onPress={() => setShowPassword(!showPassword)}
              style={styles.eyeButton}
              testID="toggle-password"
            >
              <Ionicons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={22}
                color={Colors.textSecondary}
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.loginButton, (isSubmitting || loginMutation.isPending) && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={isSubmitting || loginMutation.isPending}
            testID="login-submit"
          >
            {(isSubmitting || loginMutation.isPending) ? (
              <ActivityIndicator color={Colors.background} />
            ) : (
              <Text style={styles.loginButtonText}>{t("auth.login")}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push("/(auth)/forgot-password")}
            style={styles.forgotRow}
            testID="go-forgot-password"
          >
            <Text style={styles.forgotLink}>Password dimenticata?</Text>
          </TouchableOpacity>

          <View style={styles.registerRow}>
            <Text style={styles.registerPrompt}>{t("auth.noAccount")}</Text>
            <TouchableOpacity onPress={() => router.push("/(auth)/register")} testID="go-register">
              <Text style={styles.registerLink}>{t("auth.register")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 48,
  },
  appName: {
    fontSize: 36,
    fontWeight: "bold" as const,
    color: Colors.accent,
    marginTop: 12,
    letterSpacing: 2,
  },
  tagline: {
    fontSize: 15,
    fontStyle: "italic" as const,
    color: Colors.textSecondary,
    marginTop: 6,
    fontWeight: "600" as const,
  },
  formContainer: {
    gap: 16,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(229, 57, 53, 0.15)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8,
  },
  errorText: {
    color: Colors.error,
    fontSize: 13,
    flex: 1,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    height: 52,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: Colors.text,
    fontSize: 15,
    height: "100%",
  },
  passwordInput: {
    paddingRight: 40,
  },
  eyeButton: {
    position: "absolute",
    right: 14,
    height: "100%",
    justifyContent: "center",
  },
  loginButton: {
    backgroundColor: Colors.accent,
    borderRadius: 12,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  loginButtonDisabled: {
    opacity: 0.7,
  },
  loginButtonText: {
    color: Colors.background,
    fontSize: 17,
    fontWeight: "700" as const,
    letterSpacing: 0.5,
  },
  registerRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: 16,
  },
  registerPrompt: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  registerLink: {
    color: Colors.accent,
    fontSize: 14,
    fontWeight: "600" as const,
  },
  forgotRow: {
    alignItems: "center",
    marginTop: 8,
  },
  forgotLink: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
});
