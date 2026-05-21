import React from "react";
import { View, Text, StyleSheet, TextInput } from "react-native";
import Colors from "@/constants/colors";

interface RouteOptionsPanelProps {
  title: string;
  setTitle: (text: string) => void;
  description: string;
  setDescription: (text: string) => void;
}

export const RouteOptionsPanel: React.FC<RouteOptionsPanelProps> = ({
  title,
  setTitle,
  description,
  setDescription,
}) => {
  return (
    <>
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Titolo *</Text>
        <TextInput
          style={styles.input}
          placeholder="Es. Giro del Lago di Garda"
          placeholderTextColor={Colors.textSecondary}
          value={title}
          onChangeText={setTitle}
          maxLength={200}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Descrizione</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Descrivi il percorso..."
          placeholderTextColor={Colors.textSecondary}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={3}
        />
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  section: { marginBottom: 16 },
  sectionLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 6,
    fontWeight: "600" as const,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  textArea: { height: 80, textAlignVertical: "top" as const },
});
