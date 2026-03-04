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
  Alert,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";

export default function VerifyEmailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { email } = useLocalSearchParams<{ email: string }>();

  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  const handleVerify = async () => {
    if (!token.trim()) {
      setError("Inserisci il codice di verifica");
      return;
    }
    if (token.trim().length !== 6) {
      setError("Il codice deve essere di 6 caratteri");
      return;
    }

    setError("");
    setIsVerifying(true);
    try {
      const res = await apiRequest("POST", "/api/auth/verify-email", {
        email,
        token: token.trim(),
      });
      router.replace("/(tabs)");
    } catch (err: any) {
      const msg = err?.message || "Errore durante la verifica";
      const cleaned = msg.replace(/^\d+:\s*/, "");
      try {
        const parsed = JSON.parse(cleaned);
        setError(parsed.message || cleaned);
      } catch {
        setError(cleaned);
      }
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
    } catch (err: any) {
      const msg = err?.message || "Errore durante l'invio";
      const cleaned = msg.replace(/^\d+:\s*/, "");
      try {
        const parsed = JSON.parse(cleaned);
        setError(parsed.message || cleaned);
      } catch {
        setError(cleaned);
      }
    } finally {
      setIsResending(false);
    }
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
            paddingTop: Platform.OS === "web" ? 67 + 40 : insets.top + 40,
            paddingBottom: Platform.OS === "web" ? 34 + 20 : insets.bottom + 20,
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
        <Text style={styles.subtitle}>
          Abbiamo inviato un codice di verifica a
        </Text>
        <Text style={styles.emailText}>{email}</Text>

        {error ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={18} color={Colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {resendSuccess ? (
          <View style={styles.successBanner}>
            <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
            <Text style={styles.successText}>Codice reinviato con successo</Text>
          </View>
        ) : null}

        <View style={styles.inputWrapper}>
          <Ionicons name="key-outline" size={20} color={Colors.textSecondary} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Codice a 6 caratteri"
            placeholderTextColor={Colors.textSecondary}
            value={token}
            onChangeText={(text) => setToken(text.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
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
          style={[styles.resendButton, isResending && styles.buttonDisabled]}
          onPress={handleResend}
          disabled={isResending}
          testID="verify-resend"
        >
          {isResending ? (
            <ActivityIndicator color={Colors.accent} />
          ) : (
            <Text style={styles.resendButtonText}>Reinvia codice</Text>
          )}
        </TouchableOpacity>
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
    paddingHorizontal: 28,
    justifyContent: "center",
  },
  iconContainer: {
    alignItems: "center",
    marginBottom: 24,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.accent,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    color: Colors.text,
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  emailText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.accent,
    textAlign: "center",
    marginBottom: 32,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(244, 67, 54, 0.1)",
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  errorText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.error,
    flex: 1,
  },
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(76, 175, 80, 0.1)",
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  successText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.success,
    flex: 1,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    height: 52,
    fontFamily: "Inter_500Medium",
    fontSize: 18,
    color: Colors.text,
    letterSpacing: 4,
    textAlign: "center",
  },
  verifyButton: {
    height: 52,
    borderRadius: 14,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  verifyButtonText: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: Colors.background,
  },
  resendButton: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  resendButtonText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.accent,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
