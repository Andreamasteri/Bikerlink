import React from "react";
import { View, Text, StyleSheet, TextInput, Switch, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface ClubItem {
  id: string;
  name: string;
  clubType: string;
  region: string | null;
  brandName: string | null;
  memberCount: number;
}

interface EventParticipantSettingsProps {
  form: {
    isRecurring: boolean;
    recurrenceInfo: string;
    maxParticipants: string;
    websiteUrl: string;
  };
  set: (key: any, value: any) => void;
  inviteClubsEnabled: boolean;
  setInviteClubsEnabled: (enabled: boolean) => void;
  selectedClubIds: string[];
  clubSearch: string;
  setClubSearch: (text: string) => void;
  filteredClubs: ClubItem[];
  toggleClub: (id: string) => void;
}

export function EventParticipantSettings({
  form,
  set,
  inviteClubsEnabled,
  setInviteClubsEnabled,
  selectedClubIds,
  clubSearch,
  setClubSearch,
  filteredClubs,
  toggleClub,
}: EventParticipantSettingsProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Dettagli evento</Text>

      <View style={styles.toggleRow}>
        <View style={styles.toggleLeft}>
          <Text style={styles.toggleLabel}>Evento ricorrente</Text>
          <Text style={styles.toggleHint}>Es. ogni anno, ogni mese, ecc.</Text>
        </View>
        <Switch
          value={form.isRecurring}
          onValueChange={(v) => set("isRecurring", v)}
          trackColor={{ true: Colors.accent, false: Colors.border }}
          thumbColor="#fff"
        />
      </View>

      {form.isRecurring && (
        <>
          <Text style={styles.label}>Descrivi la ricorrenza</Text>
          <TextInput
            style={styles.input}
            value={form.recurrenceInfo}
            onChangeText={(v) => set("recurrenceInfo", v)}
            placeholder="Es. ogni prima domenica del mese / ogni anno a luglio"
            placeholderTextColor={Colors.textSecondary}
          />
        </>
      )}

      <Text style={styles.label}>Max partecipanti (0 = illimitato)</Text>
      <TextInput
        style={styles.input}
        value={form.maxParticipants}
        onChangeText={(v) => set("maxParticipants", v)}
        placeholder="0"
        placeholderTextColor={Colors.textSecondary}
        keyboardType="numeric"
      />

      <Text style={styles.label}>Sito web (opzionale)</Text>
      <TextInput
        style={styles.input}
        value={form.websiteUrl}
        onChangeText={(v) => set("websiteUrl", v)}
        placeholder="https://..."
        placeholderTextColor={Colors.textSecondary}
        keyboardType="url"
        autoCapitalize="none"
      />

      <Text style={styles.sectionTitle}>Invita Motoclub</Text>

      <View style={styles.toggleRow}>
        <View style={styles.toggleLeft}>
          <Text style={styles.toggleLabel}>Seleziona club da invitare</Text>
          <Text style={styles.toggleHint}>
            {inviteClubsEnabled && selectedClubIds.length > 0
              ? `${selectedClubIds.length} club selezionat${selectedClubIds.length === 1 ? "o" : "i"}`
              : "I club verranno notificati alla creazione"}
          </Text>
        </View>
        <Switch
          value={inviteClubsEnabled}
          onValueChange={setInviteClubsEnabled}
          trackColor={{ true: Colors.accent, false: Colors.border }}
          thumbColor="#fff"
        />
      </View>

      {inviteClubsEnabled && (
        <View style={styles.clubPickerContainer}>
          <View style={styles.clubSearchRow}>
            <Ionicons name="search" size={16} color={Colors.textSecondary} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.clubSearchInput}
              value={clubSearch}
              onChangeText={setClubSearch}
              placeholder="Cerca club per nome o regione..."
              placeholderTextColor={Colors.textSecondary}
            />
            {clubSearch.length > 0 && (
              <Pressable onPress={() => setClubSearch("")} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color={Colors.textSecondary} />
              </Pressable>
            )}
          </View>

          <View style={styles.clubList}>
            {filteredClubs.length === 0 ? (
              <Text style={styles.clubEmptyText}>Nessun club trovato</Text>
            ) : (
              filteredClubs.map((club) => {
                const isSelected = selectedClubIds.includes(club.id);
                const subtitle = club.brandName
                  ? `Brand · ${club.brandName}`
                  : club.region
                  ? `Regione · ${club.region}`
                  : club.clubType;
                return (
                  <Pressable
                    key={club.id}
                    style={[styles.clubRow, isSelected && styles.clubRowSelected]}
                    onPress={() => toggleClub(club.id)}
                  >
                    <View style={styles.clubRowLeft}>
                      <Text style={[styles.clubName, isSelected && { color: Colors.accent }]}>
                        {club.name}
                      </Text>
                      <Text style={styles.clubSubtitle}>{subtitle}</Text>
                    </View>
                    <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                      {isSelected && <Ionicons name="checkmark" size={14} color="#000" />}
                    </View>
                  </Pressable>
                );
              })
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 4,
  },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: Colors.accent,
    marginTop: 16,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  label: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 10,
    marginBottom: 4,
  },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.text,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 10,
  },
  toggleLeft: {
    flex: 1,
    gap: 2,
  },
  toggleLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.text,
  },
  toggleHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  clubPickerContainer: {
    marginTop: 8,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  clubSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  clubSearchInput: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.text,
  },
  clubList: {},
  clubEmptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    paddingVertical: 16,
  },
  clubRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  clubRowSelected: {
    backgroundColor: Colors.surfaceLight,
  },
  clubRowLeft: {
    flex: 1,
    gap: 2,
  },
  clubName: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.text,
  },
  clubSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  checkboxSelected: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
});
