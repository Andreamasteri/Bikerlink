import React from "react";
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, ActivityIndicator, Platform } from "react-native";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useQuery } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/query-client";
import { AdminUser } from "./UserCard";

interface PrivacySettings {
  ghostMode: boolean;
  fixedPositionEnabled: boolean;
  fixedPositionLat: number | null;
  fixedPositionLng: number | null;
  hideFromMap: boolean;
  hideOnlineStatus: boolean;
  hideLastSeen: boolean;
  hideDistance: boolean;
  offlinePositionRandomize: boolean;
  positionFuzz: boolean;
  positionFuzzKm: number;
  fakeHomeEnabled: boolean;
  fakeWorkEnabled: boolean;
  fakeWhateverEnabled: boolean;
  gpsPrecision: string;
}

interface UserPrivacyModalProps {
  visible: boolean;
  onClose: () => void;
  user: AdminUser | null;
}

function BoolRow({ label, value, warn }: { label: string; value: boolean; warn?: boolean }) {
  const color = value ? (warn ? Colors.warning : Colors.success) : Colors.textSecondary;
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <MaterialIcons
          name={value ? "check-circle" : "cancel"}
          size={16}
          color={color}
        />
        <Text style={[styles.value, { color }]}>{value ? "ON" : "OFF"}</Text>
      </View>
    </View>
  );
}

export const UserPrivacyModal: React.FC<UserPrivacyModalProps> = ({ visible, onClose, user }) => {
  const { data, isLoading, isError } = useQuery<PrivacySettings>({
    queryKey: ["/api/admin/users", user?.id, "privacy-settings"],
    enabled: visible && !!user,
    queryFn: async () => {
      const url = new URL(`/api/admin/users/${user!.id}/privacy-settings`, getApiUrl());
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === "ios" ? "formSheet" : undefined}
      onRequestClose={onClose}
      transparent={Platform.OS !== "ios"}
    >
      <View style={[styles.overlay, Platform.OS !== "ios" && styles.overlayDim]}>
        <View style={styles.container}>
          <View style={styles.header}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="shield-checkmark-outline" size={20} color={Colors.accent} />
              <Text style={styles.title}>Privacy — {user?.nickname}</Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={Colors.accent} />
              <Text style={styles.note}>Caricamento impostazioni...</Text>
            </View>
          ) : isError ? (
            <View style={styles.center}>
              <Ionicons name="alert-circle-outline" size={32} color={Colors.error} />
              <Text style={[styles.note, { color: Colors.error }]}>Errore nel caricamento</Text>
            </View>
          ) : data ? (
            <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
              <Text style={styles.sectionTitle}>Visibilità</Text>
              <BoolRow label="Ghost Mode" value={data.ghostMode} warn />
              <BoolRow label="Non visibile sulla mappa" value={data.hideFromMap} warn />
              <BoolRow label="Nascondi stato online" value={data.hideOnlineStatus} />
              <BoolRow label="Nascondi ultimo accesso" value={data.hideLastSeen} />
              <BoolRow label="Nascondi distanza" value={data.hideDistance} />

              <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Posizione</Text>
              <BoolRow label="Posizione fissa" value={data.fixedPositionEnabled} warn />
              {data.fixedPositionEnabled && data.fixedPositionLat != null && data.fixedPositionLng != null && (
                <View style={styles.row}>
                  <Text style={styles.label}>Coordinate fissa</Text>
                  <Text style={[styles.value, { color: Colors.accent }]}>
                    {data.fixedPositionLat.toFixed(5)}, {data.fixedPositionLng.toFixed(5)}
                  </Text>
                </View>
              )}
              <BoolRow label="Randomizza posizione offline" value={data.offlinePositionRandomize} />
              <BoolRow label="Sfuma posizione (fuzz)" value={data.positionFuzz} />
              {data.positionFuzz && (
                <View style={styles.row}>
                  <Text style={styles.label}>Raggio sfumatura</Text>
                  <Text style={styles.value}>{data.positionFuzzKm} km</Text>
                </View>
              )}

              <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Zone false</Text>
              <BoolRow label="Zona Casa finta" value={data.fakeHomeEnabled} />
              <BoolRow label="Zona Lavoro finta" value={data.fakeWorkEnabled} />
              <BoolRow label="Zona Custom finta" value={data.fakeWhateverEnabled} />

              <Text style={[styles.sectionTitle, { marginTop: 16 }]}>GPS</Text>
              <View style={styles.row}>
                <Text style={styles.label}>Precisione GPS</Text>
                <Text style={styles.value}>{data.gpsPrecision}</Text>
              </View>

              <View style={styles.readOnlyNote}>
                <Ionicons name="eye-outline" size={14} color={Colors.textSecondary} />
                <Text style={styles.readOnlyText}>Sola lettura — nessuna modifica admin</Text>
              </View>
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  overlayDim: {
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  container: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "85%",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: Colors.text,
  },
  sectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 4,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border + "44",
  },
  label: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.text,
    flex: 1,
  },
  value: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.text,
    textAlign: "right",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 40,
    gap: 12,
  },
  note: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  readOnlyNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 24,
    justifyContent: "center",
  },
  readOnlyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    fontStyle: "italic",
  },
});
