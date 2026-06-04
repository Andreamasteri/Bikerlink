import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import type { ThemeColors } from "@/constants/colors";
import { useWhisperRecorder } from "@/hooks/useWhisperRecorder";

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
  const whisper = useWhisperRecorder();
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!whisper.error) return;
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => {
      whisper.reset();
    }, 3000);
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, [whisper.error]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMicPress = async () => {
    if (whisper.error) whisper.reset();

    if (whisper.recording) {
      const text = await whisper.stopAndTranscribe();
      if (text) {
        setAiPrompt(aiPrompt ? `${aiPrompt} ${text}` : text);
      }
    } else {
      await whisper.startRecording();
    }
  };

  const micDisabled = Platform.OS === "web" || whisper.transcribing || aiLoading;

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

        <TouchableOpacity
          style={[
            s.micBtn,
            whisper.recording && s.micBtnRecording,
            micDisabled && s.micBtnDisabled,
          ]}
          onPress={handleMicPress}
          disabled={micDisabled}
          activeOpacity={0.7}
          accessibilityLabel={
            whisper.recording ? "Ferma registrazione" : "Registra con microfono"
          }
        >
          {whisper.transcribing ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : whisper.recording ? (
            <Ionicons name="stop" size={18} color="#fff" />
          ) : (
            <Ionicons
              name="mic"
              size={18}
              color={
                Platform.OS === "web"
                  ? colors.textSecondary
                  : colors.text
              }
            />
          )}
        </TouchableOpacity>
      </View>

      {!!whisper.error && (
        <Text style={s.errorHint}>{whisper.error}</Text>
      )}

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
      paddingBottom: 44,
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
  });
