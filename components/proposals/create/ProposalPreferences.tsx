import React from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Switch } from "react-native";
import Colors from "@/constants/colors";

interface ProposalPreferencesProps {
  maxParticipants: string;
  setMaxParticipants: (val: string) => void;
  returnDeadlineEnabled: boolean;
  setReturnDeadlineEnabled: (val: boolean) => void;
  returnDeadlineTime: string;
  setReturnDeadlineTime: (val: string) => void;
  formatTimeInput: (val: string) => string;
  autoCompleteTime: (val: string) => string;
  extendToDestination: boolean;
  setExtendToDestination: (val: boolean) => void;
  destinationExtRadius: string;
  setDestinationExtRadius: (val: string) => void;
  canExtendToDestination: boolean;
  selectedClubId: string | null;
  setSelectedClubId: (val: string | null) => void;
  myClubs: { id: string; name: string }[];
}

export const ProposalPreferences = ({
  maxParticipants,
  setMaxParticipants,
  returnDeadlineEnabled,
  setReturnDeadlineEnabled,
  returnDeadlineTime,
  setReturnDeadlineTime,
  formatTimeInput,
  autoCompleteTime,
  extendToDestination,
  setExtendToDestination,
  destinationExtRadius,
  setDestinationExtRadius,
  canExtendToDestination,
  selectedClubId,
  setSelectedClubId,
  myClubs,
}: ProposalPreferencesProps) => {
  return (
    <View>
      <Text style={styles.sectionTitle}>Numero massimo partecipanti</Text>
      <TextInput
        style={styles.input}
        value={maxParticipants}
        onChangeText={setMaxParticipants}
        placeholder="Esempio: 5 (lascia vuoto per nessun limite)"
        placeholderTextColor={Colors.textSecondary}
        keyboardType="number-pad"
      />

      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.switchLabel}>Rientro previsto</Text>
          <Text style={styles.switchSub}>Specifica un orario di rientro</Text>
        </View>
        <Switch
          value={returnDeadlineEnabled}
          onValueChange={setReturnDeadlineEnabled}
          trackColor={{ false: Colors.border, true: Colors.accent }}
        />
      </View>

      {returnDeadlineEnabled && (
        <View style={{ marginTop: 12 }}>
          <Text style={styles.sectionTitle}>Orario di rientro (HH:MM) *</Text>
          <TextInput
            style={styles.input}
            value={returnDeadlineTime}
            onChangeText={(v) => setReturnDeadlineTime(formatTimeInput(v))}
            onBlur={() => setReturnDeadlineTime(autoCompleteTime(returnDeadlineTime))}
            placeholder="HH:MM"
            placeholderTextColor={Colors.textSecondary}
            keyboardType="number-pad"
            maxLength={5}
          />
        </View>
      )}

      {canExtendToDestination && (
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchLabel}>Includi destinazione nella ricerca</Text>
            <Text style={styles.switchSub}>Cerca anche biker vicino all'arrivo</Text>
          </View>
          <Switch
            value={extendToDestination}
            onValueChange={setExtendToDestination}
            trackColor={{ false: Colors.border, true: Colors.accent }}
          />
        </View>
      )}

      {canExtendToDestination && extendToDestination && (
        <View style={{ marginTop: 12 }}>
          <Text style={styles.sectionTitle}>Raggio ricerca a destinazione (km) *</Text>
          <TextInput
            style={styles.input}
            value={destinationExtRadius}
            onChangeText={setDestinationExtRadius}
            placeholder="50"
            placeholderTextColor={Colors.textSecondary}
            keyboardType="number-pad"
          />
        </View>
      )}

      {myClubs.length > 0 && (
        <View style={{ marginTop: 24 }}>
          <Text style={styles.sectionTitle}>Pubblica come Moto Club</Text>
          <Text style={styles.clubNote}>Solo i membri del club potranno vedere questa proposta</Text>
          <View style={styles.clubSelectorRow}>
            {myClubs.map((club) => (
              <TouchableOpacity
                key={club.id}
                style={[
                  styles.clubChip,
                  selectedClubId === club.id && styles.clubChipActive,
                ]}
                onPress={() => setSelectedClubId(selectedClubId === club.id ? null : club.id)}
              >
                <Text style={[
                  styles.clubChipText,
                  selectedClubId === club.id && styles.clubChipTextActive
                ]}>
                  {club.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
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
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginTop: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  switchLabel: { color: Colors.text, fontSize: 14, fontWeight: "600" },
  switchSub: { color: Colors.textSecondary, fontSize: 11, marginTop: 2 },
  clubSelectorRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  clubChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  clubChipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  clubChipText: { fontSize: 13, color: Colors.textSecondary, fontFamily: "Inter_500Medium" },
  clubChipTextActive: { color: Colors.text },
  clubNote: { fontSize: 12, color: Colors.accent, marginBottom: 8, fontFamily: "Inter_400Regular" },
});
