import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Switch, Ionicons } from "@expo/vector-icons";
import { View as RNView, Text as RNText, StyleSheet as RNStyleSheet, TouchableOpacity as RNTouchableOpacity, Switch as RNSwitch } from "react-native";
import { Ionicons as IoniconsSet } from "@expo/vector-icons";
import Colors, { THEMES, THEME_META, ThemeName } from "@/constants/colors";
import { useT } from "@/lib/language-context";

const themeStyles = RNStyleSheet.create({
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  switchLabel: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text },
  switchDesc: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary },
  defaultLabel: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.text, marginBottom: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 16 },
  card: {
    width: "47%", backgroundColor: Colors.surface, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: Colors.border, position: "relative",
  },
  cardActive: { borderColor: Colors.accent, backgroundColor: Colors.accent + "08" },
  checkmark: { position: "absolute", top: 8, right: 8, zIndex: 1 },
  swatches: { flexDirection: "row", gap: 4, marginBottom: 8 },
  swatch: { width: 16, height: 16, borderRadius: 4, borderWidth: 1, borderColor: "rgba(0,0,0,0.05)" },
  cardLabel: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.text },
  cardDesc: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
});

const brandThemeStyles = RNStyleSheet.create({
  grid: { gap: 10 },
  card: {
    flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 12,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, gap: 12,
  },
  cardSelected: { borderColor: Colors.accent, backgroundColor: Colors.accent + "08" },
  swatch: {
    width: 48, height: 48, borderRadius: 10, padding: 6, gap: 4,
    justifyContent: "center", alignItems: "center",
  },
  swatchAccent: { width: 14, height: 14, borderRadius: 7, position: "absolute", top: 6, right: 6 },
  swatchSurface: { width: "100%", height: 4, borderRadius: 2 },
  swatchText: { width: "70%", height: 4, borderRadius: 2, alignSelf: "flex-start" },
  cardBody: { flex: 1 },
  cardLabel: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.text },
  cardDesc: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary },
});

const styles = RNStyleSheet.create({
  sectionHeaderRow: {
    flexDirection: "row", alignItems: "center", gap: 8, marginTop: 20, marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: "Inter_700Bold", fontSize: 16, color: Colors.textSecondary,
    textTransform: "uppercase", letterSpacing: 0.5,
  },
});

interface ThemeSectionProps {
  themeUserSwitching: boolean;
  onThemeUserSwitchingToggle: (val: boolean) => void;
  themeUserSwitchingPending: boolean;
  themeDefaultName: ThemeName;
  onThemeDefaultChange: (name: ThemeName) => void;
  themeDefaultPending: boolean;
  currentTheme: ThemeName;
  setTheme: (name: ThemeName) => void;
  colors: any;
}

export function ThemeSection({
  themeUserSwitching,
  onThemeUserSwitchingToggle,
  themeUserSwitchingPending,
  themeDefaultName,
  onThemeDefaultChange,
  themeDefaultPending,
  currentTheme,
  setTheme,
}: ThemeSectionProps) {
  const t = useT();

  return (
    <RNView>
      <RNView style={[styles.sectionHeaderRow, { marginTop: 0 }]}>
        <IoniconsSet name="color-palette" size={20} color={Colors.accent} />
        <RNText style={styles.sectionTitle}>Colori App</RNText>
      </RNView>

      <RNView style={themeStyles.switchRow}>
        <RNView style={{ flex: 1 }}>
          <RNText style={themeStyles.switchLabel}>Permetti agli utenti di cambiare tema</RNText>
          <RNText style={themeStyles.switchDesc}>
            {themeUserSwitching
              ? "Ogni utente sceglie il proprio stile visivo"
              : t("admin.themeForAll")}
          </RNText>
        </RNView>
        <RNSwitch
          value={themeUserSwitching}
          onValueChange={onThemeUserSwitchingToggle}
          trackColor={{ false: Colors.border, true: Colors.accent + "88" }}
          thumbColor={themeUserSwitching ? Colors.accent : Colors.textSecondary}
          disabled={themeUserSwitchingPending}
        />
      </RNView>

      {!themeUserSwitching && (
        <>
          <RNText style={themeStyles.defaultLabel}>Tema predefinito per tutti gli utenti:</RNText>
          <RNView style={themeStyles.grid}>
            {(["attuale", "asfalto", "velocita", "rotta"] as ThemeName[]).map((name) => {
              const theme = THEMES[name];
              const meta = THEME_META[name];
              const isActive = themeDefaultName === name;
              return (
                <RNTouchableOpacity
                  key={name}
                  style={[themeStyles.card, isActive && themeStyles.cardActive]}
                  onPress={() => onThemeDefaultChange(name)}
                  activeOpacity={0.8}
                  disabled={themeDefaultPending}
                >
                  {isActive && (
                    <RNView style={themeStyles.checkmark}>
                      <IoniconsSet name="checkmark-circle" size={18} color={theme.accent} />
                    </RNView>
                  )}
                  <RNView style={themeStyles.swatches}>
                    <RNView style={[themeStyles.swatch, { backgroundColor: theme.background }]} />
                    <RNView style={[themeStyles.swatch, { backgroundColor: theme.accent }]} />
                    <RNView style={[themeStyles.swatch, { backgroundColor: theme.surface }]} />
                  </RNView>
                  <RNText style={themeStyles.cardLabel} numberOfLines={1}>{meta.label}</RNText>
                  <RNText style={themeStyles.cardDesc} numberOfLines={2}>{meta.description}</RNText>
                </RNTouchableOpacity>
              );
            })}
          </RNView>
        </>
      )}

      {!themeUserSwitching && (
        <RNView style={{ height: 1, backgroundColor: Colors.border, marginVertical: 16, marginHorizontal: 4 }} />
      )}
      <RNText style={[themeStyles.defaultLabel, { marginBottom: 8 }]}>Il tuo tema (questo dispositivo):</RNText>
      <RNView style={brandThemeStyles.grid}>
        {(Object.keys(THEMES) as ThemeName[]).map((key) => {
          const theme = THEMES[key];
          const isSelected = currentTheme === key;
          return (
            <RNTouchableOpacity
              key={key}
              style={[brandThemeStyles.card, isSelected && brandThemeStyles.cardSelected]}
              onPress={() => setTheme(key as ThemeName)}
              activeOpacity={0.75}
            >
              <RNView style={[brandThemeStyles.swatch, { backgroundColor: theme.background }]}>
                <RNView style={[brandThemeStyles.swatchAccent, { backgroundColor: theme.accent }]} />
                <RNView style={[brandThemeStyles.swatchSurface, { backgroundColor: theme.surface }]} />
                <RNView style={[brandThemeStyles.swatchText, { backgroundColor: theme.text + "33" }]} />
              </RNView>
              <RNView style={brandThemeStyles.cardBody}>
                <RNText style={[brandThemeStyles.cardLabel, isSelected && { color: Colors.accent }]}>
                  {THEME_META[key as ThemeName].label}
                </RNText>
                <RNText style={brandThemeStyles.cardDesc}>{THEME_META[key as ThemeName].description}</RNText>
              </RNView>
              {isSelected && (
                <IoniconsSet name="checkmark-circle" size={20} color={Colors.accent} style={{ marginLeft: "auto" }} />
              )}
            </RNTouchableOpacity>
          );
        })}
      </RNView>
    </RNView>
  );
}
