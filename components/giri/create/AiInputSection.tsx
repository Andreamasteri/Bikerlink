import React from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import type { ThemeColors } from "@/constants/colors";

interface AiInputSectionProps {
  aiPrompt: string;
  setAiPrompt: (v: string) => void;
  aiLoading: boolean;
  handleAiParse: () => void;
}

export const AiInputSection: React.FC<AiInputSectionProps> = ({
  aiPrompt,
  setAiPrompt,
  aiLoading,
  handleAiParse,
}) => {
  const colors = useColors();
  const s = styles(colors);

  return (
    <View style={s.section}>
      <Text style={s.sectionLabel}>Descrivi il tuo giro</Text>

      <View style={s.inputWrapper}>
        <TextInput
          style={s.aiInput}
          placeholder={
            "Es: 3 ore di curve sulle Alpi partendo da Milano,\nevitando autostrade, ritorno incluso"
          }
          placeholderTextColor={colors.textSecondary}
          value={aiPrompt}
          onChangeText={setAiPrompt}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />

      </View>


      <Pressable
        style={[s.primaryBtn, (aiLoading || !aiPrompt.trim()) && { opacity: 0.6 }]}
        onPress={handleAiParse}
        disabled={aiLoading || !aiPrompt.trim()}
      >
        {aiLoading ? (
          <ActivityIndicator color="#000" size="small" />
        ) : (
          <Ionicons name="sparkles" size={18} color="#000" />
        )}
        <Text style={s.primaryBtnText}>
          {aiLoading ? "Elaborazione..." : "Genera con AI"}
        </Text>
      </Pressable>

      <Text style={s.hint}>
        L'AI interpreterà la tua richiesta e compilerà automaticamente il percorso
      </Text>
    </View>
  );
};

const styles = (colors: ThemeColors) =>
  StyleSheet.create({
    section: { marginBottom: 20 },
    sectionLabel: {
      fontFamily: "Inter_600SemiBold",
      fontSize: 13,
      color: colors.textSecondary,
      marginBottom: 8,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    inputWrapper: {
      position: "relative",
      marginBottom: 12,
    },
    aiInput: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 14,
      paddingBottom: 14,
      fontFamily: "Inter_400Regular",
      fontSize: 15,
      color: colors.text,
      minHeight: 100,
      borderWidth: 1,
      borderColor: colors.border,
    },
    micBtn: {
      position: "absolute",
      bottom: 10,
      right: 10,
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    micBtnRecording: {
      backgroundColor: "#ef4444",
      borderColor: "#ef4444",
    },
    micBtnDisabled: {
      opacity: 0.4,
    },
    primaryBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: colors.accent,
      borderRadius: 14,
      paddingVertical: 14,
      marginBottom: 10,
    },
    primaryBtnText: {
      fontFamily: "Inter_700Bold",
      fontSize: 15,
      color: "#000",
    },
    hint: {
      fontFamily: "Inter_400Regular",
      fontSize: 12,
      color: colors.textSecondary,
      textAlign: "center",
    },
    errorHint: {
      fontFamily: "Inter_400Regular",
      fontSize: 12,
      color: "#ef4444",
      marginBottom: 8,
    },
    sourceHint: {
      fontFamily: "Inter_400Regular",
      fontSize: 12,
      color: colors.textSecondary,
      marginBottom: 8,
    },
  });
