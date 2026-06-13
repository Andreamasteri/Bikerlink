import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

type Reason = { key: string; label: string };

const KEY_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  tipo_moto: "bicycle",
  garage: "heart",
  propProfile: "map",
  proposal: "map",
  musica: "musical-notes",
  stile_guida: "speedometer",
  routeAffinity: "trail-sign",
  telemetryAffinity: "pulse",
  supermatch: "flash",
};

/**
 * Maps the actual score_breakdown JSONB keys (as stored by the matching engine)
 * to the canonical reason key + label used by chips and the match-summary route.
 * Multiple breakdown keys may collapse to the same reason (e.g. combined music scores).
 * Order matters for deduplication: most informative key first per reason.
 */
const SCORE_KEY_TO_REASON: Array<{
  breakdownKey: string;
  reasonKey: string;
  label: string;
}> = [
  { breakdownKey: "combinedMusicScore", reasonKey: "musica",      label: "Musica 🎵" },
  { breakdownKey: "musicScore",         reasonKey: "musica",      label: "Musica 🎵" },
  { breakdownKey: "musicEmbeddingScore",reasonKey: "musica",      label: "Musica 🎵" },
  { breakdownKey: "bikeTypeScore",      reasonKey: "tipo_moto",   label: "Stessa moto 🏍" },
  { breakdownKey: "styleScore",         reasonKey: "stile_guida", label: "Stile guida 🛣" },
];

const SCORE_THRESHOLD = 0.20;

function deriveReasons(
  scoreBreakdown: Record<string, unknown>,
  isSupermatch: boolean,
): Reason[] {
  const sb = scoreBreakdown as Record<string, number>;

  // Build scored candidates: map breakdown keys → reason, filter above threshold
  const scored: Array<{ reasonKey: string; label: string; score: number }> = [];
  const seenReasonKeys = new Set<string>();

  for (const { breakdownKey, reasonKey, label } of SCORE_KEY_TO_REASON) {
    if (seenReasonKeys.has(reasonKey)) continue;
    const score = sb[breakdownKey];
    if (typeof score === "number" && score >= SCORE_THRESHOLD) {
      scored.push({ reasonKey, label, score });
      seenReasonKeys.add(reasonKey);
    }
  }

  // Sort descending by score, take top chip slots (leave room for supermatch)
  scored.sort((a, b) => b.score - a.score);
  const maxFromBreakdown = isSupermatch ? 1 : 2;
  const reasons: Reason[] = scored
    .slice(0, maxFromBreakdown)
    .map(({ reasonKey, label }) => ({ key: reasonKey, label }));

  if (isSupermatch) {
    reasons.unshift({ key: "supermatch", label: "Supermatch ⚡" });
  }

  return reasons;
}

interface Props {
  scoreBreakdown?: Record<string, unknown> | null;
  isSupermatch?: boolean;
  motorcycleBrand?: string | null;
}

export function MatchReasonChipsInline({ scoreBreakdown, isSupermatch, motorcycleBrand }: Props) {
  if (motorcycleBrand === "base_intent") {
    return (
      <View style={styles.row}>
        <View style={styles.chip}>
          <Ionicons name="people" size={12} color={Colors.accent} />
          <Text style={styles.chipLabel}>Intento ruolo 🤝</Text>
        </View>
      </View>
    );
  }
  const reasons = deriveReasons(scoreBreakdown ?? {}, isSupermatch ?? false);
  if (reasons.length === 0) return null;

  return (
    <View style={styles.row}>
      {reasons.map((r) => {
        const iconName = KEY_ICON[r.key] ?? "star";
        return (
          <View key={r.key} style={styles.chip}>
            <Ionicons name={iconName} size={12} color={Colors.accent} />
            <Text style={styles.chipLabel}>{r.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
    marginBottom: 2,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: Colors.accent + "18",
    borderWidth: 1,
    borderColor: Colors.accent + "35",
  },
  chipLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.accent,
  },
});
