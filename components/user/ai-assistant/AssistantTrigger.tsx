// Task #2698 — Trigger compatto da montare nelle schermate chiave (home, mappa,
// profilo) quando la modalità "selective" è attiva. Si nasconde se la modalità
// FAB globale è già attiva (evita duplicazione UI).
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/lib/language-context";
import { useAssistantEnabled } from "@/hooks/useAssistantEnabled";
import AssistantChatSheet from "./AssistantChatSheet";

interface Props {
  screen: "home" | "map" | "profile";
}

export default function AssistantTrigger({ screen }: Props) {
  const colors = useColors();
  const t = useT();
  const { selectiveEnabled, fabEnabled } = useAssistantEnabled();
  const [open, setOpen] = useState(false);
  if (!selectiveEnabled || fabEnabled) return null;
  return (
    <View style={styles.wrap}>
      <Pressable
        testID={`assistant-trigger-${screen}`}
        onPress={() => setOpen(true)}
        style={[styles.btn, { backgroundColor: colors.surface, borderColor: colors.primary }]}
      >
        <Ionicons name="sparkles" size={16} color={colors.primary} />
        <Text style={[styles.label, { color: colors.primary }]}>
          {t(`aiAssistant.trigger.${screen}`) || (t("aiAssistant.trigger.ask") || "Chiedi all'AI")}
        </Text>
      </Pressable>
      <AssistantChatSheet visible={open} onClose={() => setOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: "flex-end", padding: 8 },
  btn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, borderWidth: 1,
  },
  label: { fontSize: 13, fontWeight: "600" },
});
