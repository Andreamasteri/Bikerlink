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
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { t as translate } from "@/lib/i18n";
import { useT } from "@/lib/language-context";
import { apiRequest, getApiUrl, setSessionToken } from "@/lib/query-client";
import { parseApiError } from "@/lib/parse-api-error";

const RESEND_COOLDOWN = 60;

export default function VerifyEmailScreen() {
  const tr = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { email } = useLocalSearchParams<{ email: string }>();

  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [emailConfigured, setEmailConfigured] = useState<boolean | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [showNoEmailHint, setShowNoEmailHint] = useState(false);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch(new URL("/api/auth/email-configured", getApiUrl()).toString())
      .then((r) => r.json())
      .then((d) => setEmailConfigured(d.configured ?? false))
      .catch(() => setEmailConfigured(false));

    // Task #56: dopo 60s mostra un avviso più prominente "Non hai ricevuto l'email?"
    const t = setTimeout(() => setShowNoEmailHint(true), 60000);
    return () => clearTimeout(t);
  }, []);

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

  useEffect(() => () => { if (cooldownRef.current) clearInterval(cooldownRef.current); }, []);

  // Task #56: il backend ritorna "Troppi tentativi" su 429. Lo riconosciamo e
  // mostriamo un messaggio più chiaro con hint a usare il cooldown.
  const friendlyError = (raw: string): string => {
    if (/troppi tentativi/i.test(raw)) {
      return translate("auth.tooManyCodeRequests");
    }
    if (/già utilizzato/i.test(raw)) {
      return translate("auth.codeAlreadyUsed");
    }
    if (/codice scaduto/i.test(raw)) {
      return translate("auth.codeExpired");
    }
    if (/codice non valido/i.test(raw)) {
      return translate("auth.codeInvalid");
    }
    return raw;
  };

  const handleVerify = async () => {
    if (!token.trim()) { setError(translate("auth.codeEnterPrompt")); return; }
    if (token.trim().length !== 8) { setError(translate("auth.codeLength")); return; }
    setError("");
    setIsVerifying(true);
    try {
      const res = await apiRequest("POST", "/api/auth/verify-email", { email, token: token.trim() });
      const userData = await res.json();
      if (userData?.sessionToken) {
        await setSessionToken(userData.sessionToken);
      }
      const { sessionToken: _omit, ...user } = userData ?? {};
      void _omit;
      queryClient.setQueryData(["/api/auth/me"], user);
      router.replace("/(tabs)");
    } catch (err: unknown) {
      setError(friendlyError(parseApiError(err, translate("auth.verifyError"))));
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    setError("");
    setResendSuccess(false);
    setIsResending(true);
    try {
      await apiRequest("POST", "/api/auth/resend-verification", { email });
      setResendSuccess(true);
      startCooldown();
    } catch (err: unknown) {
      setError(friendlyError(parseApiError(err, translate("auth.sendError"))));
    } finally {
      setIsResending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
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
        <View style={styles.iconContainer}>
          <View style={styles.iconCircle}>
            <Ionicons name="mail-open" size={48} color={Colors.accent} />
          </View>
        </View>

        <Text style={styles.title}>Verifica Email</Text>

        {emailConfigured === false && (
          <View style={styles.warnBanner}>
            <Ionicons name="warning" size={18} color="#F59E0B" />
            <Text style={styles.warnText}>
              {tr("auth.emailServiceNotConfigured")}
            </Text>
          </View>
        )}

        <Text style={styles.subtitle}>Abbiamo inviato un codice di verifica a</Text>
        <Text style={styles.emailText}>{email}</Text>
        <Text style={styles.emailWarning}>{tr("auth.checkEmailCorrect")}</Text>
        <Text style={styles.spamHint}>Controlla anche la cartella spam.</Text>

        {showNoEmailHint && !resendSuccess ? (
          <View style={styles.noEmailHint}>
            <Ionicons name="information-circle" size={18} color={Colors.accent} />
            <Text style={styles.noEmailHintText}>
              {translate("auth.emailNotReceived")}
            </Text>
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={18} color={Colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {resendSuccess ? (
          <View style={styles.successBanner}>
            <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
            <Text style={styles.successText}>Codice reinviato — controlla la tua email</Text>
          </View>
        ) : null}

        <View style={styles.inputWrapper}>
          <Ionicons name="key-outline" size={20} color={Colors.textSecondary} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder={translate("auth.codePlaceholder")}
            placeholderTextColor={Colors.textSecondary}
            value={token}
            onChangeText={(text) => setToken(text.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={8}
            testID="verify-code-input"
          />
        </View>

        <TouchableOpacity
          style={[styles.verifyButton, isVerifying && styles.buttonDisabled]}
          onPress={handleVerify}
          disabled={isVerifying}
          testID="verify-submit"
        >
          {isVerifying ? (
            <ActivityIndicator color={Colors.background} />
          ) : (
            <Text style={styles.verifyButtonText}>Verifica</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.resendButton, (isResending || resendCooldown > 0) && styles.buttonDisabled]}
          onPress={handleResend}
          disabled={isResending || resendCooldown > 0}
          testID="verify-resend"
        >
          {isResending ? (
            <ActivityIndicator color={Colors.accent} />
          ) : (
            <Text style={styles.resendButtonText}>
              {resendCooldown > 0 ? translate("auth.resendCooldown").replace("{seconds}", String(resendCooldown)) : translate("auth.resendCode")}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },
  container: { flexGrow: 1, paddingHorizontal: 28, justifyContent: "center" },
  iconContainer: { alignItems: "center", marginBottom: 24 },
  iconCircle: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: Colors.accent,
  },
  title: { fontFamily: "Inter_700Bold", fontSize: 28, color: Colors.text, textAlign: "center", marginBottom: 16 },
  warnBanner: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: "rgba(245,158,11,0.12)", padding: 12, borderRadius: 10,
    borderLeftWidth: 3, borderLeftColor: "#F59E0B", marginBottom: 16,
  },
  warnText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 13, color: "#F59E0B", lineHeight: 18 },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 15, color: Colors.textSecondary, textAlign: "center" },
  emailText: { fontFamily: "Inter_700Bold", fontSize: 30, color: Colors.text, textAlign: "center", marginBottom: 8 },
  emailWarning: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, textAlign: "center", textDecorationLine: "underline", marginBottom: 4 },
  spamHint: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, textAlign: "center", marginBottom: 24 },
  noEmailHint: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: "rgba(255,107,53,0.10)", padding: 12, borderRadius: 10,
    borderLeftWidth: 3, borderLeftColor: Colors.accent, marginBottom: 16,
  },
  noEmailHintText: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.text, lineHeight: 18 },
  errorBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "rgba(244,67,54,0.1)", padding: 12, borderRadius: 10, marginBottom: 16,
  },
  errorText: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.error, flex: 1 },
  successBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "rgba(76,175,80,0.1)", padding: 12, borderRadius: 10, marginBottom: 16,
  },
  successText: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.success, flex: 1 },
  inputWrapper: {
    flexDirection: "row", alignItems: "center", backgroundColor: Colors.surface,
    borderRadius: 14, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 16, marginBottom: 20,
  },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, height: 52, fontFamily: "Inter_500Medium", fontSize: 18, color: Colors.text, letterSpacing: 4, textAlign: "center" },
  verifyButton: { height: 52, borderRadius: 14, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  verifyButtonText: { fontFamily: "Inter_700Bold", fontSize: 16, color: Colors.background },
  resendButton: { height: 48, borderRadius: 14, borderWidth: 1, borderColor: Colors.accent, alignItems: "center", justifyContent: "center" },
  resendButtonText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.accent },
  buttonDisabled: { opacity: 0.5 },
});
