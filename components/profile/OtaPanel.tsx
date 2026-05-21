import React, { useState, useCallback } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import type { PendingOtaRelease } from "./types";

type Props = {
  isAdmin: boolean;
};

export default function OtaPanel({ isAdmin }: Props) {
  const [approvingOtaId, setApprovingOtaId] = useState<string | null>(null);

  const { data: pendingOtaData, refetch: refetchPendingOta } = useQuery<PendingOtaRelease[]>({
    queryKey: ["/api/admin/ota/pending"],
    enabled: isAdmin,
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const pendingOtaReleases = pendingOtaData ?? [];

  const handleApproveOta = useCallback(async (releaseId: string, version: string) => {
    Alert.alert(
      "Approva OTA",
      `Distribuisci la versione ${version} a tutti gli utenti?`,
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Sì, distribuisci",
          style: "default",
          onPress: async () => {
            setApprovingOtaId(releaseId);
            try {
              await apiRequest("POST", `/api/admin/ota/${releaseId}/approve`);
              await refetchPendingOta();
              Alert.alert("✓ Approvata", `OTA ${version} ora in distribuzione su slot stable.`);
            } catch (err: unknown) {
              Alert.alert("Errore", err instanceof Error ? err.message : "Impossibile approvare la release.");
            } finally {
              setApprovingOtaId(null);
            }
          },
        },
      ],
    );
  }, [refetchPendingOta]);

  if (!isAdmin || pendingOtaReleases.length === 0) return null;

  return (
    <View style={styles.otaApprovalWidget}>
      <View style={styles.otaApprovalHeader}>
        <Ionicons name="cloud-upload-outline" size={18} color="#FF9500" />
        <Text style={styles.otaApprovalTitle}>
          {pendingOtaReleases.length === 1 ? "1 OTA in attesa" : `${pendingOtaReleases.length} OTA in attesa`}
        </Text>
      </View>
      {pendingOtaReleases.map((rel) => (
        <View key={rel.id} style={styles.otaApprovalRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.otaApprovalVersion}>v{rel.version}</Text>
            {rel.runtime_version ? (
              <Text style={styles.otaApprovalMeta}>rv {rel.runtime_version}</Text>
            ) : null}
          </View>
          <TouchableOpacity
            style={[styles.otaApprovalBtn, approvingOtaId === rel.id && { opacity: 0.6 }]}
            onPress={() => handleApproveOta(rel.id, rel.version)}
            disabled={approvingOtaId !== null}
          >
            {approvingOtaId === rel.id ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.otaApprovalBtnText}>Distribuisci</Text>
            )}
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  otaApprovalWidget: {
    marginHorizontal: 0,
    marginVertical: 8,
    backgroundColor: "rgba(255,149,0,0.10)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,149,0,0.35)",
    padding: 12,
    gap: 8,
  },
  otaApprovalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  otaApprovalTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#FF9500",
  },
  otaApprovalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
  },
  otaApprovalVersion: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  otaApprovalMeta: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  otaApprovalBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 14,
    minWidth: 100,
    alignItems: "center",
  },
  otaApprovalBtnText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
});
