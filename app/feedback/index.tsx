import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/query-client";
import Colors from "@/constants/colors";
import { t } from "@/lib/i18n";

const TICKET_TYPES = [
  { key: "feedback", label: t("feedback.suggestion"), icon: "chatbubble-ellipses" as const },
  { key: "bug", label: t("feedback.bug"), icon: "bug" as const },
  { key: "other", label: t("feedback.other"), icon: "ellipsis-horizontal-circle" as const },
];

export default function FeedbackScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [ticketType, setTicketType] = useState("feedback");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const feedbackMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/feedback", {
        ticketType,
        subject,
        message,
      });
      return res.json();
    },
    onSuccess: () => {
      Alert.alert(t("common.success"), "Feedback inviato con successo!");
      setSubject("");
      setMessage("");
      setTicketType("feedback");
      if (router.canGoBack()) {
        router.back();
      }
    },
    onError: (error: Error) => {
      Alert.alert(t("common.error"), error.message);
    },
  });

  const handleSubmit = () => {
    if (!subject.trim()) {
      Alert.alert(t("common.error"), "Inserisci un oggetto");
      return;
    }
    if (!message.trim()) {
      Alert.alert(t("common.error"), "Inserisci un messaggio");
      return;
    }
    feedbackMutation.mutate();
  };

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  return (
    <KeyboardAvoidingView
      style={[styles.container]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={90}
    >
      <View
        style={[
          styles.header,
          { paddingTop: (Platform.OS === "web" ? webTopInset : insets.top) + 12 },
        ]}
      >
        <TouchableOpacity onPress={() => router.canGoBack() && router.back()}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("feedback.title")}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: (Platform.OS === "web" ? webBottomInset : insets.bottom) + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.sectionLabel}>{t("feedback.type")}</Text>
        <View style={styles.typeRow}>
          {TICKET_TYPES.map((type) => (
            <TouchableOpacity
              key={type.key}
              style={[
                styles.typeChip,
                ticketType === type.key && styles.typeChipActive,
              ]}
              onPress={() => setTicketType(type.key)}
            >
              <Ionicons
                name={type.icon}
                size={18}
                color={ticketType === type.key ? Colors.background : Colors.textSecondary}
              />
              <Text
                style={[
                  styles.typeChipText,
                  ticketType === type.key && styles.typeChipTextActive,
                ]}
              >
                {type.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Oggetto</Text>
        <TextInput
          style={styles.input}
          placeholder="Oggetto del feedback"
          placeholderTextColor={Colors.textSecondary}
          value={subject}
          onChangeText={setSubject}
          maxLength={200}
        />

        <Text style={styles.sectionLabel}>Messaggio</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder={t("feedback.placeholder")}
          placeholderTextColor={Colors.textSecondary}
          value={message}
          onChangeText={setMessage}
          multiline
          numberOfLines={6}
          textAlignVertical="top"
        />

        <View style={styles.placeholderSection}>
          <Text style={styles.placeholderTitle}>Funzionalità in arrivo</Text>
          <View style={styles.placeholderCard}>
            <Ionicons name="logo-paypal" size={22} color={Colors.maleIcon} />
            <View style={styles.placeholderInfo}>
              <Text style={styles.placeholderName}>Donazioni PayPal</Text>
              <Text style={styles.placeholderDesc}>Supporta BikerLink con una donazione</Text>
            </View>
            <View style={styles.plannedBadge}>
              <Text style={styles.plannedText}>Pianificato</Text>
            </View>
          </View>
          <View style={styles.placeholderCard}>
            <Ionicons name="restaurant" size={22} color={Colors.accent} />
            <View style={styles.placeholderInfo}>
              <Text style={styles.placeholderName}>Foodtracker</Text>
              <Text style={styles.placeholderDesc}>Trova soste lungo il percorso</Text>
            </View>
            <View style={styles.plannedBadge}>
              <Text style={styles.plannedText}>Pianificato</Text>
            </View>
          </View>
          <View style={styles.placeholderCard}>
            <Ionicons name="cloud-upload" size={22} color={Colors.success} />
            <View style={styles.placeholderInfo}>
              <Text style={styles.placeholderName}>Backup Google Drive</Text>
              <Text style={styles.placeholderDesc}>Salva percorsi e foto nel cloud</Text>
            </View>
            <View style={styles.plannedBadge}>
              <Text style={styles.plannedText}>Pianificato</Text>
            </View>
          </View>
        </View>

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
              <Text style={styles.submitButtonText}>{t("feedback.send")}</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
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
  sectionLabel: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: Colors.textSecondary,
    marginBottom: 8,
    marginTop: 16,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  typeRow: {
    flexDirection: "row" as const,
    gap: 10,
  },
  typeChip: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  typeChipActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  typeChipText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  typeChipTextActive: {
    color: Colors.background,
    fontWeight: "600" as const,
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
    height: 140,
    textAlignVertical: "top" as const,
  },
  placeholderSection: {
    marginTop: 32,
    marginBottom: 24,
  },
  placeholderTitle: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: Colors.text,
    marginBottom: 12,
  },
  placeholderCard: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  placeholderInfo: {
    flex: 1,
    marginLeft: 12,
  },
  placeholderName: {
    fontSize: 15,
    fontWeight: "600" as const,
    color: Colors.text,
  },
  placeholderDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  plannedBadge: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  plannedText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: "500" as const,
  },
  submitButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    marginTop: 8,
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
