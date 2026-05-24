import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,

  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/query-client";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";

export default function BugReportScreen() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const feedbackMutation = useMutation({
    mutationFn: async () => {
      const url = new URL("/api/feedback", getApiUrl());
      const res = await globalThis.fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketType: "bug", subject, message }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: t("feedback.unknownError") }));
        throw new Error((err as Error).message || t("feedback.sendError"));
      }
      return res.json();
    },
    onSuccess: () => {
      Alert.alert("Successo", "Segnalazione bug inviata! Grazie per il tuo aiuto.");
      setSubject("");
      setMessage("");
      if (router.canGoBack()) router.back();
    },
    onError: (error: Error) => {
      Alert.alert("Errore", (error as Error).message);
    },
  });

  const handleSubmit = () => {
    if (!subject.trim()) {
      Alert.alert(t("common.error"), t("feedback.subjectRequired"));
      return;
    }
    if (!message.trim()) {
      Alert.alert(t("common.error"), t("feedback.describeRequired"));
      return;
    }
    feedbackMutation.mutate();
  };

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 12 },
        ]}
      >
        <TouchableOpacity onPress={() => router.canGoBack() && router.back()}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleRow}>
          <Ionicons name="bug" size={22} color={Colors.accentRed} />
          <Text style={styles.headerTitle}>Segnala un Bug</Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={20} color={Colors.accentRed} />
          <Text style={styles.infoText}>
            {t("feedback.bugDescHint")}
          </Text>
        </View>

        <Text style={styles.sectionLabel}>Oggetto</Text>
        <TextInput
          style={styles.input}
          placeholder={t("feedback.bugPlaceholderFull")}
          placeholderTextColor={Colors.textSecondary}
          value={subject}
          onChangeText={setSubject}
          maxLength={200}
        />

        <Text style={styles.sectionLabel}>Descrizione del Bug</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder={t("feedback.bugPlaceholder")}
          placeholderTextColor={Colors.textSecondary}
          value={message}
          onChangeText={setMessage}
          multiline
          numberOfLines={8}
          textAlignVertical="top"
        />

        <TouchableOpacity
          style={[styles.submitButton, feedbackMutation.isPending && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={feedbackMutation.isPending}
        >
          {feedbackMutation.isPending ? (
            <ActivityIndicator color={Colors.background} />
          ) : (
            <>
              <Ionicons name="send" size={20} color={Colors.background} />
              <Text style={styles.submitButtonText}>Invia Segnalazione</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitleRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600" as const,
    color: Colors.text,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  infoCard: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 10,
    backgroundColor: `${Colors.accentRed}15`,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: `${Colors.accentRed}30`,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: Colors.textSecondary,
    marginBottom: 8,
    marginTop: 16,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  textArea: {
    height: 180,
    textAlignVertical: "top" as const,
  },
  submitButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    backgroundColor: Colors.accentRed,
    borderRadius: 12,
    paddingVertical: 16,
    marginTop: 24,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: Colors.background,
  },
});
