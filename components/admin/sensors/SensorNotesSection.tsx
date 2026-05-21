import React from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";
import Colors from "@/constants/colors";

interface SensorNotesSectionProps {
  notes: string;
  onChangeNotes: (text: string) => void;
}

export const SensorNotesSection: React.FC<SensorNotesSectionProps> = ({ notes, onChangeNotes }) => {
  return (
    <View style={ss.notesSection}>
      <Text style={ss.sectionLabel}>Note</Text>
      <TextInput
        style={ss.notesInput}
        value={notes}
        onChangeText={onChangeNotes}
        placeholder="Annotazioni personali (salvate automaticamente)…"
        placeholderTextColor={Colors.textSecondary}
        multiline
        textAlignVertical="top"
      />
    </View>
  );
};

const ss = StyleSheet.create({
  notesSection: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    gap: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  notesInput: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    minHeight: 100,
    lineHeight: 20,
  },
});
