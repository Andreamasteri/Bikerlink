import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";

interface AiSectionProps {
  aiStatus: "idle" | "loading" | "success" | "error";
  handleAiComplete: () => Promise<void>;
  aiResult: string;
  aiSummary: Record<string, number> | null;
}

export const AiSection: React.FC<AiSectionProps> = ({
  aiStatus,
  handleAiComplete,
  aiResult,
  aiSummary,
}) => {
  const t = useT();

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.stepBadge}>
          <Text style={styles.stepBadgeText}>3</Text>
        </View>
        <View style={styles.cardHeaderText}>
          <Text style={styles.cardTitle}>Completamento AI (OpenAI)</Text>
          <Text style={styles.cardDesc}>
            Chiama OpenAI per tradurre automaticamente le chiavi ancora vuote in ogni lingua, senza sovrascrivere quelle già valorizzate.
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.button, aiStatus === "loading" && styles.buttonDisabled]}
        onPress={handleAiComplete}
        disabled={aiStatus === "loading"}
        activeOpacity={0.7}
      >
        {aiStatus === "loading" ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <MaterialCommunityIcons name="auto-fix" size={18} color="#fff" />
            <Text style={styles.buttonText}>Avvia completamento AI</Text>
          </>
        )}
      </TouchableOpacity>

      {aiResult ? (
        <View style={[styles.resultBox, aiStatus === "success" ? styles.resultBoxSuccess : styles.resultBoxError]}>
          <MaterialCommunityIcons
            name={aiStatus === "success" ? "check-circle-outline" : "alert-circle-outline"}
            size={16}
            color={aiStatus === "success" ? "#4CAF50" : "#F44336"}
          />
          <Text style={[styles.resultText, aiStatus === "success" ? styles.resultTextSuccess : styles.resultTextError]}>
            {aiResult}
          </Text>
        </View>
      ) : null}

      {aiSummary && aiStatus === "success" ? (
        <View style={styles.aiSummaryBox}>
          {Object.entries(aiSummary).map(([lang, count]) => (
            <View key={lang} style={styles.aiSummaryRow}>
              <Text style={styles.aiSummaryLang}>{lang.toUpperCase()}</Text>
              <Text style={styles.aiSummaryCount}>{count} chiavi aggiunte</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 14,
  },
  cardHeaderText: { flex: 1 },
  stepBadge: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.accent,
    alignItems: "center", justifyContent: "center",
  },
  stepBadgeText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
  cardTitle: { fontSize: 15, color: Colors.text, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  cardDesc: { fontSize: 12, color: Colors.textSecondary, fontFamily: "Inter_400Regular", lineHeight: 16 },
  button: {
    backgroundColor: Colors.accent,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  resultBox: {
    marginTop: 10, paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: 8, flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: Colors.background,
  },
  resultBoxSuccess: { backgroundColor: "#4CAF5015" },
  resultBoxError: { backgroundColor: "#F4433615" },
  resultText: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  resultTextSuccess: { color: "#4CAF50" },
  resultTextError: { color: "#F44336" },
  aiSummaryBox: {
    marginTop: 10,
    backgroundColor: Colors.background,
    borderRadius: 8,
    padding: 10,
    gap: 6,
  },
  aiSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  aiSummaryLang: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.accent,
    width: 36,
  },
  aiSummaryCount: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    flex: 1,
    marginLeft: 8,
  },
});
