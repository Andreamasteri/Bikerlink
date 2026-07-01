import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import type { TerminalTheme } from "../constants/theme";

interface ComposerProps {
  input: string;
  onChangeText: (v: string) => void;
  onSubmit: () => void;
  streaming: boolean;
  attachedImage: string | null;
  onRemoveImage: () => void;
  onPickImage: () => void;
  theme: TerminalTheme;
  bottomInset: number;
}

export function Composer({
  input,
  onChangeText,
  onSubmit,
  streaming,
  attachedImage,
  onRemoveImage,
  onPickImage,
  theme,
  bottomInset,
}: ComposerProps) {
  const disabled = streaming || (!input.trim() && !attachedImage);
  return (
    <>
      {attachedImage ? (
        <View style={[styles.attachRow, { borderTopColor: theme.border }]}>
          <Image source={{ uri: attachedImage }} style={styles.attachThumb} contentFit="cover" />
          <Pressable
            onPress={onRemoveImage}
            hitSlop={10}
            style={[styles.attachRemove, { backgroundColor: theme.surface }]}
            testID="terminal-image-remove"
          >
            <Ionicons name="close" size={16} color={theme.text} />
          </Pressable>
        </View>
      ) : null}

      <View
        style={[
          styles.inputBar,
          { borderTopColor: theme.border, paddingBottom: bottomInset + 8 },
        ]}
      >
        <Pressable
          onPress={onPickImage}
          disabled={streaming}
          hitSlop={8}
          style={[styles.iconBtn, { opacity: streaming ? 0.4 : 1 }]}
          testID="terminal-attach"
        >
          <Ionicons name="image-outline" size={22} color={theme.textSecondary} />
        </Pressable>
        <TextInput
          value={input}
          onChangeText={onChangeText}
          onSubmitEditing={onSubmit}
          editable={!streaming}
          blurOnSubmit={false}
          multiline
          style={[styles.input, { color: theme.text, backgroundColor: theme.surface }]}
          placeholder={streaming ? "Bowie sta scrivendo…" : "Scrivi un messaggio…"}
          placeholderTextColor={theme.textSecondary}
          returnKeyType="send"
          testID="terminal-input"
        />
        <Pressable
          onPress={onSubmit}
          disabled={disabled}
          style={[
            styles.sendBtn,
            {
              backgroundColor: theme.bowie,
              opacity: disabled ? 0.4 : 1,
            },
          ]}
          testID="terminal-send"
        >
          <Ionicons name="arrow-up" size={20} color={theme.accentText} />
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  attachRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  attachThumb: { width: 56, height: 56, borderRadius: 10 },
  attachRemove: {
    marginLeft: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  iconBtn: { height: 40, width: 32, alignItems: "center", justifyContent: "center" },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontSize: 15,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});
