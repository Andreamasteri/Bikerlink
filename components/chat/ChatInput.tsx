import React, { useRef, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";
import { useWhisperRecorder } from "@/hooks/useWhisperRecorder";

interface ChatInputProps {
  inputText: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onSendPhoto: () => void;
  onSendLocation: () => void;
  onSharePlaylist: () => void;
  isUploadingImage: boolean;
  isPrivateChat: boolean;
}

export function ChatInput({
  inputText,
  onChangeText,
  onSend,
  onSendPhoto,
  onSendLocation,
  onSharePlaylist,
  isUploadingImage,
  isPrivateChat,
}: ChatInputProps) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const whisper = useWhisperRecorder();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const [showSource, setShowSource] = useState<"home" | "cloud" | null>(null);
  const sourceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (whisper.recording) setShowSource(null);
  }, [whisper.recording]);

  useEffect(() => {
    if (!whisper.lastSource) return;
    setShowSource(whisper.lastSource);
    if (sourceTimerRef.current) clearTimeout(sourceTimerRef.current);
    sourceTimerRef.current = setTimeout(() => {
      setShowSource(null);
    }, 4000);
    return () => {
      if (sourceTimerRef.current) clearTimeout(sourceTimerRef.current);
    };
  }, [whisper.lastSource]);

  const startPulse = () => {
    pulseLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.3, duration: 500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    );
    pulseLoopRef.current.start();
  };

  const stopPulse = () => {
    pulseLoopRef.current?.stop();
    pulseAnim.setValue(1);
  };

  const handleMicPressIn = async () => {
    await whisper.startRecording();
    startPulse();
  };

  const handleMicPressOut = async () => {
    stopPulse();
    const text = await whisper.stopAndTranscribe();
    if (text) {
      onChangeText(inputText ? inputText + " " + text : text);
    }
  };

  const micColor = whisper.recording
    ? Colors.accent
    : whisper.transcribing
    ? Colors.warning
    : Colors.accent;

  const isMicBusy = whisper.recording || whisper.transcribing;

  return (
    <View style={[styles.inputContainer, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
      {!whisper.recording && !whisper.transcribing && !!showSource && (
        <Text style={styles.sourceHint}>
          {showSource === "home" ? "🏠 Trascritto in locale" : "☁️ Trascritto via cloud"}
        </Text>
      )}
      <View style={styles.inputRow}>
        <TouchableOpacity
          onPress={onSendPhoto}
          style={styles.attachButton}
          disabled={isUploadingImage}
        >
          {isUploadingImage ? (
            <ActivityIndicator size="small" color={Colors.accent} />
          ) : (
            <Ionicons name="camera-outline" size={24} color={Colors.accent} />
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={onSendLocation} style={styles.attachButton}>
          <Ionicons name="location-outline" size={24} color={Colors.accent} />
        </TouchableOpacity>

        {isPrivateChat && (
          <TouchableOpacity onPress={onSharePlaylist} style={styles.attachButton}>
            <Ionicons name="musical-notes-outline" size={24} color={Colors.accent} />
          </TouchableOpacity>
        )}

        <View style={styles.textInputContainer}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={onChangeText}
            placeholder={t("chat.placeholder")}
            placeholderTextColor={Colors.textSecondary}
            multiline
            maxLength={1000}
          />
        </View>

        <TouchableOpacity
          onPressIn={handleMicPressIn}
          onPressOut={handleMicPressOut}
          style={[styles.micButton, isMicBusy && styles.micButtonActive]}
          disabled={whisper.transcribing}
        >
          {whisper.transcribing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <Ionicons
                name={whisper.recording ? "mic" : "mic-outline"}
                size={20}
                color={isMicBusy ? "#fff" : micColor}
              />
            </Animated.View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onSend}
          style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
          disabled={!inputText.trim()}
        >
          <Ionicons name="send" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  inputContainer: {
    paddingTop: 12,
    paddingHorizontal: 12,
    backgroundColor: Colors.surface,
    borderTopWidth: 0.5,
    borderTopColor: Colors.border,
  },
  sourceHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 8,
    marginLeft: 4,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  attachButton: {
    padding: 10,
  },
  textInputContainer: {
    flex: 1,
    marginHorizontal: 4,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 40,
    maxHeight: 120,
    justifyContent: "center",
  },
  input: {
    fontSize: 16,
    color: Colors.text,
    fontFamily: "Inter_400Regular",
    paddingTop: 0,
    paddingBottom: 0,
  },
  micButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceLight,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 2,
    marginHorizontal: 2,
  },
  micButtonActive: {
    backgroundColor: Colors.accent,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.accent,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 2,
  },
  sendButtonDisabled: {
    backgroundColor: Colors.surfaceLight,
  },
});
