import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { THEMES, THEME_META, ThemeName } from "@/constants/colors";
import { useTheme } from "@/lib/theme-context";

export default function ThemePanel() {
  const { currentTheme, setTheme, userSwitchingEnabled } = useTheme();
  const [themeExpanded, setThemeExpanded] = useState(false);

  if (!userSwitchingEnabled) return null;

  return (
    <View style={styles.section}>
      <Pressable style={styles.accordionHeader} onPress={() => setThemeExpanded(v => !v)}>
        <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Stile Visivo</Text>
        <Ionicons name={themeExpanded ? "chevron-up" : "chevron-down"} size={18} color={Colors.textSecondary} />
      </Pressable>
      {themeExpanded && (
        <View style={{ paddingTop: 12, gap: 8 }}>
          {(["attuale", "asfalto", "velocita", "rotta"] as ThemeName[]).map((name) => {
            const theme = THEMES[name];
            const meta = THEME_META[name];
            const isActive = currentTheme === name;
            return (
              <Pressable
                key={name}
                style={[styles.mapStyleOption, isActive && styles.mapStyleOptionActive]}
                onPress={() => setTheme(name)}
              >
                <View style={{ flexDirection: "row", gap: 6 }}>
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: theme.background, borderWidth: 1, borderColor: Colors.border }} />
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: theme.accent, borderWidth: 1, borderColor: Colors.border }} />
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: theme.surface, borderWidth: 1, borderColor: Colors.border }} />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[styles.mapStyleName, isActive && { color: Colors.accent }]}>{meta.label}</Text>
                  <Text style={styles.mapStyleDesc} numberOfLines={1}>{meta.description}</Text>
                </View>
                {isActive && <Ionicons name="checkmark-circle" size={20} color={Colors.accent} />}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: 16,
    marginTop: 4,
  },
  accordionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginBottom: 12,
  },
  mapStyleOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  mapStyleOptionActive: {
    backgroundColor: Colors.accent + "14",
  },
  mapStyleName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginBottom: 2,
  },
  mapStyleDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    lineHeight: 16,
  },
});
