import React from "react";
import {
  Text,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface LangCheckboxProps {
  label: string;
  checked: boolean;
  onToggle: () => void;
}

export const LangCheckbox: React.FC<LangCheckboxProps> = ({
  label,
  checked,
  onToggle,
}) => {
  return (
    <TouchableOpacity style={styles.checkbox} onPress={onToggle} activeOpacity={0.7}>
      <MaterialCommunityIcons
        name={checked ? "checkbox-marked" : "checkbox-blank-outline"}
        size={22}
        color={checked ? Colors.accent : Colors.textSecondary}
      />
      <Text style={styles.checkboxLabel}>{label}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  checkbox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 6,
  },
  checkboxLabel: { fontSize: 13, color: Colors.text, fontFamily: "Inter_400Regular" },
});
