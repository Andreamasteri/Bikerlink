import React from "react";
import { View, Text, TouchableOpacity, ScrollView, TextInput, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { styles } from "./_create.styles";
import type { UserResult } from "./create";

export function SummaryStep({ 
  clubName, 
  parentType, 
  parentClubName, 
  pin, 
  useRadius, 
  radiusKm, 
  useManual, 
  selectedUsers, 
  submitMutation,
  t 
}: {
  clubName: string;
  parentType: "main" | "sub";
  parentClubName: string;
  pin: { latitude: number, longitude: number } | null;
  useRadius: boolean;
  radiusKm: string;
  useManual: boolean;
  selectedUsers: UserResult[];
  submitMutation: { isPending: boolean; mutate: () => void };
  t: (key: string) => string;
}) {
  return (
    <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
      <Text style={styles.sectionTitle}>Riepilogo richiesta</Text>

      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <Ionicons name="people-circle" size={20} color={Colors.accent} />
          <Text style={styles.summaryLabel}>Nome</Text>
          <Text style={styles.summaryValue}>{clubName}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Ionicons name="list" size={20} color={Colors.accent} />
          <Text style={styles.summaryLabel}>Tipo</Text>
          <Text style={styles.summaryValue}>
            {parentType === "main" ? "Elenco principale" : `Sub-club di "${parentClubName}"`}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Ionicons name="location" size={20} color={Colors.accent} />
          <Text style={styles.summaryLabel}>Posizione</Text>
          <Text style={styles.summaryValue}>
            {pin ? `${pin.latitude.toFixed(3)}, ${pin.longitude.toFixed(3)}` : "Non impostata"}
          </Text>
        </View>
        {useRadius && (
          <View style={styles.summaryRow}>
            <Ionicons name="radio-button-on" size={20} color={Colors.accent} />
            <Text style={styles.summaryLabel}>Raggio inviti</Text>
            <Text style={styles.summaryValue}>{radiusKm} km</Text>
          </View>
        )}
        {useManual && selectedUsers.length > 0 && (
          <View style={styles.summaryRow}>
            <Ionicons name="people" size={20} color={Colors.accent} />
            <Text style={styles.summaryLabel}>Inviti manuali</Text>
            <Text style={styles.summaryValue}>{selectedUsers.length} utenti</Text>
          </View>
        )}
      </View>

      <Text style={styles.summaryNote}>
        {t("motoclub.requestSentDesc")}
      </Text>

      <TouchableOpacity
        style={[styles.submitBtn, submitMutation.isPending && { opacity: 0.6 }]}
        onPress={() => submitMutation.mutate()}
        disabled={submitMutation.isPending}
      >
        {submitMutation.isPending ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <Ionicons name="paper-plane" size={18} color="#fff" />
            <Text style={styles.submitBtnText}>Invia Richiesta</Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

export function InviteStep({
  useRadius,
  setUseRadius,
  radiusKm,
  setRadiusKm,
  useManual,
  setUseManual,
  userSearch,
  handleSearchChange,
  t,
  searchFocused,
  setSearchFocused,
  debouncedSearch,
  searchResults,
  selectedUsers,
  toggleUser
}: {
  useRadius: boolean;
  setUseRadius: React.Dispatch<React.SetStateAction<boolean>>;
  radiusKm: string;
  setRadiusKm: React.Dispatch<React.SetStateAction<string>>;
  useManual: boolean;
  setUseManual: React.Dispatch<React.SetStateAction<boolean>>;
  userSearch: string;
  handleSearchChange: (text: string) => void;
  t: (key: string) => string;
  searchFocused: boolean;
  setSearchFocused: React.Dispatch<React.SetStateAction<boolean>>;
  debouncedSearch: string;
  searchResults: UserResult[];
  selectedUsers: UserResult[];
  toggleUser: (u: UserResult) => void;
}) {
  return (
    <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
      <Text style={styles.sectionTitle}>Inviti automatici</Text>

      <TouchableOpacity style={styles.checkRow} onPress={() => setUseRadius((v) => !v)}>
        <View style={[styles.checkbox, useRadius && styles.checkboxChecked]}>
          {useRadius && <Ionicons name="checkmark" size={14} color="#fff" />}
        </View>
        <Text style={styles.checkLabel}>Per raggio geografico</Text>
      </TouchableOpacity>
      {useRadius && (
        <View style={styles.radiusRow}>
          <Text style={styles.radiusLabel}>Utenti entro</Text>
          <TextInput
            style={styles.radiusInput}
            value={radiusKm}
            onChangeText={setRadiusKm}
            keyboardType="number-pad"
            maxLength={4}
            selectTextOnFocus
          />
          <Text style={styles.radiusLabel}>km dalla posizione del club</Text>
        </View>
      )}

      <TouchableOpacity style={[styles.checkRow, { marginTop: 16 }]} onPress={() => setUseManual((v) => !v)}>
        <View style={[styles.checkbox, useManual && styles.checkboxChecked]}>
          {useManual && <Ionicons name="checkmark" size={14} color="#fff" />}
        </View>
        <Text style={styles.checkLabel}>Selezione manuale per nickname</Text>
      </TouchableOpacity>

      {useManual && (
        <View>
          <TextInput
            style={[styles.textInput, { marginTop: 10 }]}
            value={userSearch}
            onChangeText={handleSearchChange}
            placeholder={t("motoclub.searchNickname")}
            placeholderTextColor={Colors.textSecondary}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
          />
          {searchFocused && debouncedSearch.length >= 2 && searchResults.length > 0 && (
            <View style={styles.searchDropdown}>
              {searchResults.filter((u) => !selectedUsers.find((s) => s.id === u.id)).slice(0, 8).map((u) => (
                <TouchableOpacity key={u.id} style={styles.searchItem} onPress={() => { toggleUser(u); }}>
                  <Ionicons name="person" size={16} color={Colors.textSecondary} />
                  <Text style={styles.searchItemText}>{u.nickname}</Text>
                  <Ionicons name="add-circle" size={18} color={Colors.accent} />
                </TouchableOpacity>
              ))}
            </View>
          )}
          {selectedUsers.length > 0 && (
            <View style={styles.selectedUsersBox}>
              <Text style={styles.selectedUsersTitle}>Selezionati ({selectedUsers.length})</Text>
              {selectedUsers.map((u) => (
                <View key={u.id} style={styles.selectedUserRow}>
                  <Ionicons name="person" size={14} color={Colors.accent} />
                  <Text style={styles.selectedUserName}>{u.nickname}</Text>
                  <TouchableOpacity onPress={() => toggleUser(u)}>
                    <Ionicons name="close-circle" size={18} color={Colors.accentRed} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {!useRadius && !useManual && (
        <Text style={styles.noInviteText}>Nessun invito automatico. Puoi invitare membri in seguito.</Text>
      )}
    </ScrollView>
  );
}
