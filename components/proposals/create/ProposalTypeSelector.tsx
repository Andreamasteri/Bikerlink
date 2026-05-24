import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";

interface SearchType {
  key: string;
  color: string;
  icon: string;
  label?: string;
  labelKey?: string;
  subtitleKey: string;
}
interface ProposalTypeSelectorProps {
  isZavorrina: boolean;
  searchTypes: SearchType[];
  selectedSearchTypes: string[];
  toggleSearchType: (key: string) => void;
}

export const ProposalTypeSelector = ({
  isZavorrina,
  searchTypes,
  selectedSearchTypes,
  toggleSearchType,
}: ProposalTypeSelectorProps) => {
  const t = useT();

  return (
    <View>
      <Text style={styles.sectionTitle}>
        {isZavorrina ? "Cosa vorresti?" : "Cosa cerchi?"}
      </Text>
      <View style={styles.typeGrid}>
        {searchTypes.map((st) => {
          const isSelected = selectedSearchTypes.includes(st.key);
          const isDisabled = !isSelected && selectedSearchTypes.length >= 4;
          return (
            <TouchableOpacity
              key={st.key}
              style={[
                styles.typeCard,
                isSelected && { borderColor: st.color, backgroundColor: st.color + "15" },
                isDisabled && { opacity: 0.4 },
              ]}
              onPress={() => toggleSearchType(st.key)}
              disabled={isDisabled}
            >
              <MaterialCommunityIcons
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- icon name from data
                name={st.icon as any}
                size={28}
                color={isSelected ? st.color : Colors.textSecondary}
              />
              <Text style={[styles.typeCardLabel, isSelected && { color: st.color }]}>
                {st.labelKey ? t(st.labelKey) : st.label}
              </Text>
              <Text style={styles.typeCardSub}>{t(st.subtitleKey)}</Text>
              {isSelected && (
                <View style={styles.checkIcon}>
                  <Ionicons name="checkmark-circle" size={16} color={st.color} />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.text,
    marginTop: 24,
    marginBottom: 12,
  },
  typeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  typeCard: {
    width: "48%",
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 120,
  },
  typeCardLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.text,
    marginTop: 8,
    textAlign: "center",
  },
  typeCardSub: {
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: "center",
    marginTop: 4,
  },
  checkIcon: {
    position: "absolute",
    top: 8,
    right: 8,
  },
});
