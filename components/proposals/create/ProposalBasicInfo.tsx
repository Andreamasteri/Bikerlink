import React from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";

interface ProposalBasicInfoProps {
  title: string;
  setTitle: (val: string) => void;
  description: string;
  setDescription: (val: string) => void;
  dateStr: string;
  setDateStr: (val: string) => void;
  timeFrom: string;
  setTimeFrom: (val: string) => void;
  timeTo: string;
  setTimeTo: (val: string) => void;
  formatDateInput: (val: string) => string;
  formatTimeInput: (val: string) => string;
  autoCompleteTime: (val: string) => string;
  formatDateDDMMYYYY: (d: Date) => string;
}

export const ProposalBasicInfo = ({
  title,
  setTitle,
  description,
  setDescription,
  dateStr,
  setDateStr,
  timeFrom,
  setTimeFrom,
  timeTo,
  setTimeTo,
  formatDateInput,
  formatTimeInput,
  autoCompleteTime,
  formatDateDDMMYYYY,
}: ProposalBasicInfoProps) => {
  const t = useT();

  return (
    <View>
      <Text style={styles.sectionTitle}>Titolo *</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder={t("proposals.exampleTitle")}
        placeholderTextColor={Colors.textSecondary}
        maxLength={200}
      />

      <View style={styles.dateLabelRow}>
        <Text style={styles.sectionTitle}>Data (GG/MM/AAAA) *</Text>
        <TouchableOpacity
          style={styles.dateShortcutBtn}
          onPress={() => setDateStr(formatDateDDMMYYYY(new Date()))}
        >
          <Text style={styles.dateShortcutText}>Oggi</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.dateShortcutBtn}
          onPress={() => {
            const tmw = new Date();
            tmw.setDate(tmw.getDate() + 1);
            setDateStr(formatDateDDMMYYYY(tmw));
          }}
        >
          <Text style={styles.dateShortcutText}>Domani</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.input}
        value={dateStr}
        onChangeText={(v) => setDateStr(formatDateInput(v))}
        placeholder="GG/MM/AAAA"
        placeholderTextColor={Colors.textSecondary}
        keyboardType="number-pad"
        maxLength={10}
      />

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>Dalle (HH:MM) *</Text>
          <TextInput
            style={styles.input}
            value={timeFrom}
            onChangeText={(v) => setTimeFrom(formatTimeInput(v))}
            onBlur={() => setTimeFrom(autoCompleteTime(timeFrom))}
            placeholder="HH:MM"
            placeholderTextColor={Colors.textSecondary}
            keyboardType="number-pad"
            maxLength={5}
          />
        </View>
        <View style={{ width: 16 }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>Alle (HH:MM)</Text>
          <TextInput
            style={styles.input}
            value={timeTo}
            onChangeText={(v) => setTimeTo(formatTimeInput(v))}
            onBlur={() => setTimeTo(autoCompleteTime(timeTo))}
            placeholder="HH:MM"
            placeholderTextColor={Colors.textSecondary}
            keyboardType="number-pad"
            maxLength={5}
          />
        </View>
      </View>

      <Text style={styles.sectionTitle}>Note / Descrizione</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={description}
        onChangeText={setDescription}
        placeholder="Aggiungi altri dettagli..."
        placeholderTextColor={Colors.textSecondary}
        multiline
        numberOfLines={4}
      />
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
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    color: Colors.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  row: {
    flexDirection: "row",
  },
  dateLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  dateShortcutBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + "15",
  },
  dateShortcutText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.accent,
  },
});
