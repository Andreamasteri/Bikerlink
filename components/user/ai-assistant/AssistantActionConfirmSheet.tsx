// Task #2698 — Bottom sheet di conferma azione. Testo statico (i18n key) — MAI
// generato dal LLM. L'azione parte SOLO dopo tap esplicito su "Sì".
// NOTE: usa Pressable+absoluteFill invece di Modal per evitare inset-cascade crash.
import React from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/lib/language-context";

interface Props {
  visible: boolean;
  actionId: string | null;
  confirmKey: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function AssistantActionConfirmSheet({ visible, actionId, confirmKey, onCancel, onConfirm }: Props) {
  const colors = useColors();
  const t = useT();
  if (!visible || !actionId) return null;
  const title = t("aiAssistant.confirm.title") || "Confermi questa azione?";
  const desc = confirmKey ? (t(confirmKey) || t("aiAssistant.confirm.fallback") || actionId) : actionId;
  return (
    <Pressable style={[StyleSheet.absoluteFill, styles.overlay]} onPress={onCancel}>
      <Pressable
        style={[styles.sheet, { backgroundColor: colors.surface }]}
        onPress={(e) => e.stopPropagation()}
      >
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.desc, { color: colors.textMuted ?? colors.textSecondary }]}>{desc}</Text>
        <Text style={[styles.meta, { color: colors.textMuted ?? colors.textSecondary }]} testID="assistant-confirm-actionid">
          {actionId}
        </Text>
        <View style={styles.row}>
          <Pressable
            testID="assistant-confirm-cancel"
            onPress={onCancel}
            style={[styles.btn, { backgroundColor: colors.background, borderColor: colors.border }]}
          >
            <Text style={[styles.btnText, { color: colors.text }]}>{t("common.no") || "No"}</Text>
          </Pressable>
          <Pressable
            testID="assistant-confirm-ok"
            onPress={onConfirm}
            style={[styles.btn, { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.btnText, { color: "#FFFFFF" }]}>{t("aiAssistant.confirm.yes") || "Sì, esegui"}</Text>
          </Pressable>
        </View>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: { backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end", zIndex: 9999 },
  sheet: { padding: 20, borderTopLeftRadius: 16, borderTopRightRadius: 16, gap: 12 },
  title: { fontSize: 18, fontWeight: "600" },
  desc: { fontSize: 14, lineHeight: 20 },
  meta: { fontSize: 11, fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }) },
  row: { flexDirection: "row", gap: 12, marginTop: 8 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center", borderWidth: 1, borderColor: "transparent" },
  btnText: { fontSize: 15, fontWeight: "600" },
});
