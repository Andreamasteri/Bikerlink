import React from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";

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
  return (
    <View style={[styles.inputContainer, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
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
