import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";

type ExplainFactor = { label: string; score: number; positive: boolean };
type ExplainResponse = {
  feature: string;
  description: string;
  factors: ExplainFactor[];
  usingPersonalWeights: boolean;
  otherUserId?: string | null;
  kind?: string;
};

export function WhyMatchButton({
  matchId,
  kind,
  t,
}: {
  matchId: string;
  kind: "biker" | "garage" | "proposal" | "propProfile";
  t: (k: string) => string;
}) {
  const colors = useColors();
  const [open, setOpen] = useState(false);

  const { data, isLoading, error } = useQuery<ExplainResponse>({
    queryKey: [`/api/proposals/matches/${matchId}/explain?kind=${kind}`],
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <View>
      <TouchableOpacity
        style={[styles.btn, { borderColor: colors.accent }]}
        onPress={() => setOpen(true)}
        testID={`why-match-${matchId}`}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="bulb-outline" size={14} color={colors.accent} />
        <Text style={[styles.btnText, { color: colors.accent }]}>
          {t("match.whyThisMatch") || "Perché questo match?"}
        </Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.surface }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.headerRow}>
              <Ionicons name="bulb" size={20} color={colors.accent} />
              <Text style={[styles.title, { color: colors.text }]}>
                {t("match.whyThisMatch") || "Perché questo match?"}
              </Text>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {isLoading && (
              <View style={styles.loadingBox}>
                <ActivityIndicator color={colors.accent} />
              </View>
            )}

            {error && (
              <Text style={[styles.errorText, { color: colors.accentRed }]}>
                {t("common.error") || "Errore caricamento"}
              </Text>
            )}

            {data && (
              <>
                <Text style={[styles.description, { color: colors.text }]}>{data.description}</Text>

                <View style={{ marginTop: 12 }}>
                  {data.factors.map((f, i) => (
                    <View key={`${f.label}-${i}`} style={styles.factorRow}>
                      <Ionicons
                        name={f.positive ? "checkmark-circle" : "remove-circle"}
                        size={16}
                        color={f.positive ? colors.success : colors.accentRed}
                      />
                      <Text style={[styles.factorLabel, { color: colors.text }]} numberOfLines={2}>
                        {f.label}
                      </Text>
                      <Text style={[styles.factorScore, { color: colors.textSecondary }]}>
                        ×{f.score.toFixed(2)}
                      </Text>
                    </View>
                  ))}
                </View>

                <Text style={[styles.footer, { color: colors.textSecondary }]}>
                  {data.usingPersonalWeights
                    ? t("match.personalizedWeights") || "Pesi personalizzati in base alla tua cronologia"
                    : t("match.neutralWeights") || "Pesi neutri — accetta o rifiuta almeno 10 match per personalizzare"}
                </Text>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  btnText: { fontSize: 12, fontWeight: "600" },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  sheet: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 16,
    padding: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  title: { flex: 1, fontSize: 16, fontWeight: "700" },
  description: { fontSize: 14, lineHeight: 20 },
  factorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
  },
  factorLabel: { flex: 1, fontSize: 13 },
  factorScore: { fontSize: 12, fontVariant: ["tabular-nums"] },
  footer: { marginTop: 12, fontSize: 11, fontStyle: "italic" },
  loadingBox: { padding: 16, alignItems: "center" },
  errorText: { padding: 8, fontSize: 13 },
});
