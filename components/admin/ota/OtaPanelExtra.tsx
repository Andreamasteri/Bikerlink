import React, { useState, useCallback } from "react";
import { View, Text, TouchableOpacity, Alert, ActivityIndicator, StyleSheet } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@/lib/theme-context";
import { apiRequest } from "@/lib/query-client";

export default function OtaPanelExtra() {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [pruning, setPruning] = useState(false);

  const handlePrune = useCallback(() => {
    Alert.alert(
      "Archivia vecchie OTA",
      "Archivia le release rifiutate e le release pending obsolete più vecchie della baseline approvata (o le meno recenti se non esiste ancora una release approvata).\n\nSolo release con telemetria zero vengono archiviate. Le release archiviate non appaiono nel pannello ma non vengono eliminate.",
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Archivia",
          style: "destructive",
          onPress: async () => {
            setPruning(true);
            try {
              const res = await apiRequest("POST", "/api/admin/ota/prune");
              const result = await res.json() as { ok: boolean; archivedRejected: number; archivedOldPending: number };
              await qc.invalidateQueries({ queryKey: ["/api/admin/ota/releases"] });
              Alert.alert(
                "Archiviazione completata",
                `Archiviate: ${result.archivedRejected} rifiutate + ${result.archivedOldPending} pending obsolete.`
              );
            } catch (err: unknown) {
              Alert.alert("Errore", err instanceof Error ? err.message : "Impossibile eseguire l'archiviazione");
            } finally {
              setPruning(false);
            }
          },
        },
      ]
    );
  }, [qc]);

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>
        Manutenzione DB OTA
      </Text>
      <TouchableOpacity
        style={[styles.pruneBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={handlePrune}
        disabled={pruning}
      >
        {pruning
          ? <ActivityIndicator size="small" color={colors.textSecondary} />
          : <Text style={[styles.pruneBtnText, { color: colors.textSecondary }]}>🗄 Archivia vecchie OTA</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(128,128,128,0.2)",
    alignItems: "flex-start",
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  pruneBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  pruneBtnText: {
    fontSize: 13,
    fontWeight: "500",
  },
});
