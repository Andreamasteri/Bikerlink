import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface ProfileSearchSectionProps {
  showSearchPref: boolean;
  searchPrefLocked: boolean;
  searchPreference: "bikers" | "zavorrine" | "both";
  onPreferenceChange: (value: "bikers" | "zavorrine" | "both") => void;
  currentUserType: string;
}

export const ProfileSearchSection: React.FC<ProfileSearchSectionProps> = ({
  showSearchPref,
  searchPrefLocked,
  searchPreference,
  onPreferenceChange,
  currentUserType,
}) => {
  if (currentUserType !== "biker" || !showSearchPref) return null;

  const options: { value: "bikers" | "zavorrine" | "both"; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { value: "bikers", label: "Solo Biker", icon: "bicycle" },
    { value: "zavorrine", label: "Solo Zavorrine", icon: "person" },
    { value: "both", label: "Entrambi", icon: "people" },
  ];

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Ricerca Match con ...</Text>
      <View style={styles.searchPrefRow}>
        {options.map((opt) => {
          const effectivePreference = searchPrefLocked ? "both" : searchPreference;
          const isSelected = effectivePreference === opt.value;
          return (
            <Pressable
              key={opt.value}
              style={[
                styles.searchPrefBtn,
                isSelected && styles.searchPrefBtnActive,
                searchPrefLocked && { opacity: opt.value === "both" ? 1 : 0.4 },
              ]}
              onPress={() => !searchPrefLocked && onPreferenceChange(opt.value)}
              disabled={searchPrefLocked}
            >
              <Ionicons name={opt.icon} size={20} color={isSelected ? Colors.background : Colors.textSecondary} />
              <Text style={[styles.searchPrefLabel, isSelected && styles.searchPrefLabelActive]}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: 16,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginBottom: 12,
  },
  searchPrefRow: {
    flexDirection: "row",
    gap: 8,
  },
  searchPrefBtn: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    gap: 6,
    borderWidth: 2,
    borderColor: Colors.surface,
  },
  searchPrefBtnActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  searchPrefLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
  },
  searchPrefLabelActive: {
    color: Colors.background,
  },
});
