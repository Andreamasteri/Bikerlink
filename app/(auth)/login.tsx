import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Linking } from "react-native";
import Colors from "@/constants/colors";
import { t } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { sendStartupBeacon } from "@/lib/startup-beacon";
import { SUPPORT_EMAIL } from "@/constants/register";

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { loginMutation } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setIdentifier("");
      setPassword("");
      setError("");
      setShowPassword(false);
    }, [])
  );

  const handleLogin = async () => {
    sendStartupBeacon("login_1_start");
    setError("");
    if (!identifier.trim() || !password) {
      setError(t("auth.enterCredentials"));
      return;
    }
    sendStartupBeacon("login_2_validated");
    setIsSubmitting(true);
    sendStartupBeacon("login_3_mutate");
    loginMutation.mutate(
      { identifier: identifier.trim(), password },
      {
        onSuccess: async () => {
          sendStartupBeacon("login_4_success");
          setIsSubmitting(false);
          router.replace("/");
        },
        onError: (err: Error) => {
          sendStartupBeacon("login_5_error");
          setIsSubmitting(false);
          const msg = err.message || t("auth.loginError");
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
    <KeyboardAwareScrollViewCompat
      contentContainerStyle={[
        styles.container,
        {
          paddingTop: insets.top + 40,
          paddingBottom: insets.bottom + 20,
        },
      ]}
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
              textContentType="oneTimeCode"
              autoComplete="off"
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
              textContentType="newPassword"
              autoComplete="off"
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

          <TouchableOpacity
            onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
            style={styles.supportRow}
            testID="login-support"
          >
            <Text style={styles.supportLink}>Problemi? Contatta il supporto</Text>
          </TouchableOpacity>
        </View>
    </KeyboardAwareScrollViewCompat>
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
    fontSize: 18,
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
  supportRow: {
    alignItems: "center",
    marginTop: 8,
    paddingVertical: 4,
  },
  supportLink: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textDecorationLine: "underline",
  },
});
