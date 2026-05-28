// Task #2641 — Pill colorate per scope router.
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { scopeColor, scopeLabel } from "./scopes";

export default function ScopeBadges({ scopes, size = "md" }: { scopes: string[] | null; size?: "sm" | "md" }) {
  if (!scopes || scopes.length === 0) return null;
  return (
    <View style={styles.row}>
      {scopes.map((s) => {
        const c = scopeColor(s);
        return (
          <View
            key={s}
            style={[
              styles.badge,
              size === "sm" ? styles.badgeSm : styles.badgeMd,
              { backgroundColor: c + "22", borderColor: c + "66" },
            ]}
          >
            <Text style={[styles.text, { color: c }, size === "sm" ? styles.textSm : styles.textMd]}>
              {scopeLabel(s)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  badge: { borderRadius: 6, borderWidth: 1 },
  badgeSm: { paddingHorizontal: 6, paddingVertical: 1 },
  badgeMd: { paddingHorizontal: 8, paddingVertical: 3 },
  text: { fontFamily: "Inter_600SemiBold", letterSpacing: 0.3 },
  textSm: { fontSize: 9 },
  textMd: { fontSize: 10 },
});
