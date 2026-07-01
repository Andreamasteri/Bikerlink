import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { personaColor, type TerminalTheme } from "../constants/theme";
import { extractImageUrls, PERSONA_NAMES, type Line } from "../lib/terminal-format";

interface MessageBubbleProps {
  item: Line;
  theme: TerminalTheme;
  streaming: boolean;
  onImagePress?: (uri: string) => void;
}

export function MessageBubble({ item, theme, streaming, onImagePress }: MessageBubbleProps) {
  if (item.kind === "system") {
    return (
      <View style={styles.systemRow}>
        <Text style={[styles.systemText, { color: theme.textSecondary }]}>{item.text}</Text>
      </View>
    );
  }

  if (item.kind === "user") {
    return (
      <View style={[styles.bubble, styles.bubbleUser, { backgroundColor: theme.bowie }]}>
        {item.imageUri ? (
          <Pressable onPress={() => onImagePress?.(item.imageUri!)}>
            <Image
              source={{ uri: item.imageUri }}
              style={styles.bubbleImage}
              contentFit="cover"
              transition={120}
            />
          </Pressable>
        ) : null}
        {item.text ? (
          <Text style={[styles.bubbleText, { color: theme.accentText }]}>{item.text}</Text>
        ) : null}
      </View>
    );
  }

  const persona = item.persona ?? "bowie";
  const aiImages = extractImageUrls(item.text);
  const showThinking = item.text.length === 0 && streaming;
  return (
    <View style={[styles.bubble, styles.bubbleAi, { backgroundColor: theme.surface }]}>
      <Text style={[styles.personaLabel, { color: personaColor(theme, persona) }]}>
        {PERSONA_NAMES[persona]}
      </Text>
      <Text style={[styles.bubbleText, { color: theme.text }]}>
        {showThinking ? "…" : item.text}
      </Text>
      {aiImages.map((uri) => (
        <Pressable key={uri} onPress={() => onImagePress?.(uri)}>
          <Image
            source={{ uri }}
            style={styles.bubbleImage}
            contentFit="cover"
            transition={120}
          />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: { maxWidth: "85%", borderRadius: 16, padding: 10, marginVertical: 4, gap: 8 },
  bubbleUser: { alignSelf: "flex-end", borderBottomRightRadius: 4 },
  bubbleAi: { alignSelf: "flex-start", borderBottomLeftRadius: 4 },
  personaLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  bubbleImage: { width: 200, height: 200, borderRadius: 10 },
  systemRow: { alignItems: "center", marginVertical: 6 },
  systemText: { fontSize: 12, textAlign: "center" },
});
