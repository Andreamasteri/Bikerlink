/**
 * Task #2518 — Componente "Intendevi…?" condiviso per i campi di testo.
 *
 * Mostra fino a 3 suggerimenti (alias + fuzzy) sotto a un input quando il
 * valore digitato non corrisponde esattamente a un valore canonico noto per
 * la categoria (vedi `TextAliasCategory`). Premendo un chip, il valore viene
 * sostituito tramite `onPick`.
 */
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import Colors from "@/constants/colors";
import { useTextSuggest } from "@/hooks/useTextSuggest";

interface Props {
  value: string;
  category: string;
  onPick: (next: string) => void;
  minLength?: number;
  maxItems?: number;
}

export function DidYouMean({
  value,
  category,
  onPick,
  minLength = 3,
  maxItems = 3,
}: Props) {
  const trimmed = (value ?? "").trim();
  const { suggestions } = useTextSuggest(trimmed, category, { minLength });
  if (!suggestions) return null;

  const exactMatch =
    suggestions.exact &&
    suggestions.exact.value.toLowerCase() === trimmed.toLowerCase();
  if (exactMatch) return null;

  const items: { value: string; kind: "alias" | "fuzzy" }[] = [];
  if (suggestions.alias) {
    items.push({ value: suggestions.alias.value, kind: "alias" });
  }
  for (const f of suggestions.fuzzy) {
    if (f.value.toLowerCase() === trimmed.toLowerCase()) continue;
    if (items.some((it) => it.value.toLowerCase() === f.value.toLowerCase())) continue;
    items.push({ value: f.value, kind: "fuzzy" });
    if (items.length >= maxItems) break;
  }
  if (items.length === 0) return null;

  return (
    <View style={styles.row} testID="did-you-mean">
      <Text style={styles.label}>Intendevi…?</Text>
      <View style={styles.chips}>
        {items.map((it) => (
          <TouchableOpacity
            key={it.value}
            style={styles.chip}
            onPress={() => onPick(it.value)}
            testID={`did-you-mean-chip-${it.value}`}
          >
            <Text style={styles.chipText}>{it.value}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    marginTop: 6,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  label: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  chipText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: Colors.accent,
  },
});
