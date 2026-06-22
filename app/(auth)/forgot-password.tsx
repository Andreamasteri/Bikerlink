import React, { useState, useEffect, useRef } from "react";
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
} from "react-native";
import { useRouter, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { apiRequest, setSessionToken } from "@/lib/query-client";
import { queryClient } from "@/lib/query-client";
import { useT } from "@/lib/language-context";
import { SupportContactModal } from "@/components/SupportContactModal";
import { parseApiError } from "@/lib/parse-api-error";

const RESEND_COOLDOWN = 60;

export default function ForgotPasswordScreen() {
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<1 | 2>(1);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (cooldownRef.current) clearInterval(cooldownRef.current); }, []);

  const startCooldown = () => {
    setResendCooldown(RESEND_COOLDOWN);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSendCode = async () => {
    setError("");
    if (!email.trim()) { setError(t("auth.enterEmailFP")); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError(t("auth.enterValidEmail")); return; }

    setLoading(true);
    try {
      await apiRequest("POST", "/api/auth/forgot-password", {
        email: email.trim().toLowerCase(),
      });
      setStep(2);
      startCooldown();
    } catch (err: unknown) {
      setError(parseApiError(err, t("auth.sendErrorFP")));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError("");
    setResendSuccess(false);
    setResendLoading(true);
    try {
      await apiRequest("POST", "/api/auth/resend-reset-code", {
        email: email.trim().toLowerCase(),
      });
      setResendSuccess(true);
      startCooldown();
    } catch (err: unknown) {
      setError(parseApiError(err, t("auth.sendErrorFP")));
    } finally {
      setResendLoading(false);
    }
  };

  const handleReset = async () => {
    setError("");
    if (!code.trim() || code.trim().length !== 8) {
      setError(t("auth.codeEightDigits"));
      return;
    }
    if (!/^\d{8}$/.test(code.trim())) {
      setError(t("auth.codeOnlyDigits"));
      return;
    }
    if (!newPassword || newPassword.length < 8) {
      setError(t("auth.passwordMinChars"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Le password non coincidono");
      return;
    }

    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/reset-password", {
        email: email.trim().toLowerCase(),
        code: code.trim(),
        password: newPassword,
      });
      const userData = await res.json();
      if (userData?.sessionToken) {
        await setSessionToken(userData.sessionToken);
      }
      const { sessionToken: _omit, ...user } = userData ?? {};
      void _omit;
      queryClient.setQueryData(["/api/auth/me"], user);
      router.replace("/(tabs)" as Href);
    } catch (err: unknown) {
      setError(parseApiError(err, t("auth.resetError")));
    } finally {
      setLoading(false);
    }
  };

  const paddingTop = insets.top + 40;
  const paddingBottom = insets.bottom + 20;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop, paddingBottom }]}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity
          onPress={() => (step === 2 ? setStep(1) : router.back())}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>

        <View style={styles.headerContainer}>
          <Ionicons name="key-outline" size={48} color={Colors.accent} />
          <Text style={styles.title}>Recupera Password</Text>
          {step === 1 ? (
            <Text style={styles.subtitle}>
              {t("auth.forgotPasswordHint")}
            </Text>
          ) : (
            <Text style={styles.subtitle}>
              Codice inviato a{"\n"}
              <Text style={styles.emailHighlight}>{email}</Text>
            </Text>
          )}
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={18} color={Colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {resendSuccess ? (
          <View style={styles.successBanner}>
            <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
            <Text style={styles.successText}>Nuovo codice inviato — controlla la tua email</Text>
          </View>
        ) : null}

        <View style={styles.formContainer}>
          {step === 1 ? (
            <>
              <View style={styles.inputWrapper}>
                <Ionicons name="mail-outline" size={20} color={Colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Email"
                  placeholderTextColor={Colors.textSecondary}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  testID="forgot-email"
                />
              </View>

              <TouchableOpacity
                style={[styles.submitButton, loading && styles.submitButtonDisabled]}
                onPress={handleSendCode}
                disabled={loading}
                testID="forgot-submit"
              >
                {loading ? (
                  <ActivityIndicator color={Colors.background} />
                ) : (
                  <Text style={styles.submitButtonText}>Invia codice</Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.inputWrapper}>
                <Ionicons name="keypad-outline" size={20} color={Colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, styles.codeInput]}
                  placeholder={t("auth.codeEightDigitsPlaceholder")}
                  placeholderTextColor={Colors.textSecondary}
                  value={code}
                  onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 8))}
                  keyboardType="number-pad"
                  maxLength={8}
                  testID="forgot-code"
                />
              </View>

              <View style={styles.inputWrapper}>
                <Ionicons name="lock-closed-outline" size={20} color={Colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, styles.passwordInput]}
                  placeholder={t("auth.newPasswordPlaceholder")}
                  placeholderTextColor={Colors.textSecondary}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  textContentType="newPassword"
                  autoComplete="new-password"
                  passwordRules="minlength: 8;"
                  testID="forgot-new-password"
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeButton}
                >
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={22}
                    color={Colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.inputWrapper}>
                <Ionicons name="lock-closed-outline" size={20} color={Colors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, styles.passwordInput]}
                  placeholder={t("auth.confirmPassword")}
                  placeholderTextColor={Colors.textSecondary}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  textContentType="newPassword"
                  autoComplete="new-password"
                  testID="forgot-confirm-password"
                />
              </View>

              <TouchableOpacity
                style={[styles.submitButton, loading && styles.submitButtonDisabled]}
                onPress={handleReset}
                disabled={loading}
                testID="forgot-reset-submit"
              >
                {loading ? (
                  <ActivityIndicator color={Colors.background} />
                ) : (
                  <Text style={styles.submitButtonText}>Reimposta password</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.resendButton, (resendLoading || resendCooldown > 0) && styles.resendButtonDisabled]}
                onPress={handleResend}
                disabled={resendLoading || resendCooldown > 0}
                testID="forgot-resend"
              >
                {resendLoading ? (
                  <ActivityIndicator color={Colors.accent} />
                ) : (
                  <Text style={styles.resendButtonText}>
                    {resendCooldown > 0 ? `${t("auth.resendIn").replace("{n}", String(resendCooldown))}` : t("auth.resend")}
                  </Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>

        <TouchableOpacity
          style={styles.supportLink}
          onPress={() => setShowSupportModal(true)}
          testID="forgot-support-link"
        >
          <Text style={styles.supportLinkText}>Problemi? Contatta il supporto</Text>
        </TouchableOpacity>
      </ScrollView>

      <SupportContactModal visible={showSupportModal} onClose={() => setShowSupportModal(false)} />
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
    paddingHorizontal: 28,
  },
  backButton: {
    alignSelf: "flex-start",
    padding: 4,
    marginBottom: 24,
  },
  headerContainer: {
    alignItems: "center",
    marginBottom: 28,
    gap: 8,
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginTop: 12,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 12,
  },
  emailHighlight: {
    fontFamily: "Inter_600SemiBold",
    color: Colors.accent,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(229, 57, 53, 0.15)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8,
    marginBottom: 12,
  },
  errorText: {
    color: Colors.error,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(76,175,80,0.1)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8,
    marginBottom: 12,
  },
  successText: {
    color: Colors.success,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    flex: 1,
  },
  formContainer: {
    gap: 16,
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
    fontFamily: "Inter_400Regular",
    height: "100%",
  },
  codeInput: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: 4,
    textAlign: "center",
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
  submitButton: {
    backgroundColor: Colors.accent,
    borderRadius: 12,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: Colors.background,
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
  },
  resendButton: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  resendButtonDisabled: {
    opacity: 0.5,
  },
  resendButtonText: {
    color: Colors.accent,
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  supportLink: {
    alignItems: "center",
    marginTop: 24,
    paddingVertical: 8,
  },
  supportLinkText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textDecorationLine: "underline",
  },
});
