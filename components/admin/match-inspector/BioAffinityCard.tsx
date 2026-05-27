/**
 * Task #2546 — Card "Affinità Bio" per il match-inspector admin.
 *
 * Mostra la similarità coseno tra gli embedding bio dei due utenti
 * (calcolata da /api/admin/matching/explain). Stati gestiti:
 *  - similarity numerica >= soglia → verde "alta affinità"
 *  - similarity numerica < soglia → ambra "sotto soglia"
 *  - similarity null + bioA/bioB presenti → "Embedding mancante" (backfill non eseguito)
 *  - similarity null + bio mancante → "Bio non compilata"
 */
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface Props {
  bioAffinity: {
    similarity: number | null;
    threshold: number;
    bioA: string | null;
    bioB: string | null;
    model: string | null;
  } | null;
  nicknameA?: string;
  nicknameB?: string;
}

export function BioAffinityCard({ bioAffinity, nicknameA = "A", nicknameB = "B" }: Props) {
  if (!bioAffinity) return null;

  const { similarity, threshold, bioA, bioB, model } = bioAffinity;
  const hasBoth = !!bioA && !!bioB;
  const above = similarity != null && similarity >= threshold;

  let stateLabel: string;
  let stateColor: string;
  if (similarity != null) {
    stateLabel = above ? "Alta affinità" : "Sotto soglia";
    stateColor = above ? Colors.success : Colors.warning;
  } else if (hasBoth) {
    stateLabel = "Embedding mancante";
    stateColor = Colors.textSecondary;
  } else {
    stateLabel = "Bio non compilata";
    stateColor = Colors.textSecondary;
  }

  const pct = similarity != null ? Math.round(similarity * 100) : null;

  return (
    <View style={styles.card} testID="bio-affinity-card">
      <View style={styles.header}>
        <MaterialCommunityIcons name="text-account" size={18} color={Colors.accent} />
        <Text style={styles.title}>Affinità Bio</Text>
        <View style={[styles.stateBadge, { borderColor: stateColor }]}>
          <Text style={[styles.stateText, { color: stateColor }]}>{stateLabel}</Text>
        </View>
      </View>

      {pct != null && (
        <View style={styles.scoreRow}>
          <Text style={[styles.scoreNum, { color: stateColor }]} testID="bio-affinity-score">
            {pct}%
          </Text>
          <Text style={styles.scoreThresh}>
            soglia {Math.round(threshold * 100)}%
          </Text>
        </View>
      )}

      <View style={styles.bioBlock}>
        <Text style={styles.bioLabel}>{nicknameA}</Text>
        <Text style={styles.bioText} numberOfLines={4}>
          {bioA ?? <Text style={styles.bioMissing}>— nessuna bio —</Text>}
        </Text>
      </View>

      <View style={styles.bioBlock}>
        <Text style={styles.bioLabel}>{nicknameB}</Text>
        <Text style={styles.bioText} numberOfLines={4}>
          {bioB ?? <Text style={styles.bioMissing}>— nessuna bio —</Text>}
        </Text>
      </View>

      {model && (
        <Text style={styles.modelText} testID="bio-affinity-model">modello: {model}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text, flex: 1 },
  stateBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  stateText: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  scoreRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  scoreNum: { fontFamily: "Inter_700Bold", fontSize: 28 },
  scoreThresh: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary },
  bioBlock: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 8,
    padding: 10,
    gap: 4,
  },
  bioLabel: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 },
  bioText: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.text, lineHeight: 18 },
  bioMissing: { fontStyle: "italic", color: Colors.textSecondary },
  modelText: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textSecondary, textAlign: "right" },
});
