// Task #2698 — Banner tip proattivo non bloccante. Dismiss + "non mostrare più".
import React from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/lib/language-context";

export interface AssistantTip {
  key: string;
  messageKey?: string;
  message: string;
  ctaLabel?: string;
  onCta?: () => void;
}

interface Props {
  tip: AssistantTip;
  onDismiss: () => void;
  onDisableForever: () => void;
}

export default function AssistantTipBanner({ tip, onDismiss, onDisableForever }: Props) {
  const colors = useColors();
  const t = useT();
  return (
    <View
      pointerEvents="box-none"
      style={[styles.layer, { paddingTop: Platform.OS === "web" ? 67 : 0 }]}
    >
      <View style={[styles.banner, { backgroundColor: colors.surface, borderColor: colors.primary }]} testID={`assistant-tip-${tip.key}`}>
        <Ionicons name="sparkles" size={18} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.message, { color: colors.text }]}>
            {tip.messageKey ? (t(tip.messageKey) || tip.message) : tip.message}
          </Text>
          <View style={styles.row}>
            {tip.onCta && (
              <Pressable testID={`assistant-tip-${tip.key}-cta`} onPress={tip.onCta}>
                <Text style={[styles.link, { color: colors.primary }]}>
                  {tip.ctaLabel ?? t("aiAssistant.tip.cta") ?? "Apri"}
                </Text>
              </Pressable>
            )}
            <Pressable testID={`assistant-tip-${tip.key}-dismiss`} onPress={onDismiss}>
              <Text style={[styles.link, { color: colors.textMuted ?? colors.textSecondary }]}>
                {t("aiAssistant.tip.dismiss") ?? "OK"}
              </Text>
            </Pressable>
            <Pressable testID={`assistant-tip-${tip.key}-never`} onPress={onDisableForever}>
              <Text style={[styles.linkSmall, { color: colors.textMuted ?? colors.textSecondary }]}>
                {t("aiAssistant.tip.never") ?? "Non mostrare più"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: "absolute", left: 0, right: 0, top: 0, zIndex: 8500,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  banner: {
    flexDirection: "row", gap: 10, padding: 12,
    borderRadius: 12, borderWidth: 1,
    shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  message: { fontSize: 14, lineHeight: 19 },
  row: { flexDirection: "row", gap: 16, marginTop: 8, alignItems: "center", flexWrap: "wrap" },
  link: { fontSize: 13, fontWeight: "600" },
  linkSmall: { fontSize: 12 },
});
