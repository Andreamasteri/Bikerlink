// Task #2603 — estratto da app/admin/match-control.tsx (mechanical split)
// Contiene i 4 handler (resetAll/forceUnlock/resetMatches/recalcAll) + i loro
// bottoni + AnomalyAlerts. Body identico all'originale; le dipendenze
// (queryClient, refetch, refetchLock) sono passate come props.
import React, { useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import type { QueryClient } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import { AnomalyAlerts } from "@/components/admin/matching/AnomalyAlerts";
import { styles } from "./styles";

export function EngineActionsCard({
  anomaliesCount,
  queryClient,
  refetch,
  refetchLock,
}: {
  anomaliesCount: number;
  queryClient: QueryClient;
  refetch: () => void;
  refetchLock: () => void;
}) {
  const [recalcStatus, setRecalcStatus] = useState<"idle" | "running" | "done">("idle");
  const [resetStatus, setResetStatus] = useState<"idle" | "running" | "done">("idle");
  const [resetMatchesStatus, setResetMatchesStatus] = useState<"idle" | "running" | "done">("idle");
  const [unlockStatus, setUnlockStatus] = useState<"idle" | "running" | "done">("idle");

  const handleResetAll = () => {
    Alert.alert(
      "Reset preferenze",
      "Riportare TUTTE le preferenze di matching degli utenti ai valori di default (tutto attivo)? Operazione non reversibile.",
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            try {
              setResetStatus("running");
              const res = await apiRequest("POST", "/api/admin/match-settings/reset-all");
              const json = await res.json();
              setResetStatus("done");
              Alert.alert(
                "Reset completato",
                `Preferenze ripristinate per ${json.affected ?? 0} utenti.`,
              );
              setTimeout(() => setResetStatus("idle"), 3000);
              refetch();
            } catch {
              setResetStatus("idle");
              Alert.alert("Errore", "Impossibile resettare le preferenze.");
            }
          },
        },
      ],
    );
  };

  const handleForceUnlock = () => {
    Alert.alert(
      "Forza sblocco engine",
      "Resetta il lock 'isMatchingRunning' senza riavviare il server. Usare se il motore risulta bloccato 'already_running' dopo un crash o un ciclo molto lungo.",
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Sblocca",
          style: "destructive",
          onPress: async () => {
            try {
              setUnlockStatus("running");
              const res = await apiRequest("POST", "/api/admin/matching/force-unlock");
              const json = await res.json();
              setUnlockStatus("done");
              const wasRunning = json?.before?.isRunning ?? json?.unlock?.wasRunning ?? false;
              const elapsedSec = json?.before?.elapsedMs ? Math.round(json.before.elapsedMs / 1000) : null;
              Alert.alert(
                "Engine sbloccato",
                wasRunning
                  ? `Lock rimosso${elapsedSec != null ? ` (era bloccato da ${elapsedSec}s)` : ""}.`
                  : "Il lock era già libero. Stato resettato comunque.",
              );
              setTimeout(() => setUnlockStatus("idle"), 3000);
              refetchLock();
            } catch {
              setUnlockStatus("idle");
              Alert.alert("Errore", "Impossibile sbloccare l'engine.");
            }
          },
        },
      ],
    );
  };

  const handleResetMatches = () => {
    Alert.alert(
      "Reset completo match",
      "ATTENZIONE: elimina TUTTE le righe da biker_biker_matches e biker_zavorrina_matches e sblocca l'engine. Gli utenti perderanno tutti i match esistenti (nuovi, accettati, rifiutati). Operazione irreversibile.",
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Elimina tutto",
          style: "destructive",
          onPress: async () => {
            try {
              setResetMatchesStatus("running");
              const res = await apiRequest("DELETE", "/api/admin/reset-matches");
              const json = await res.json();
              setResetMatchesStatus("done");
              const bb = json?.deleted?.bikerBiker ?? 0;
              const bz = json?.deleted?.bikerZavorrina ?? 0;
              const wasRunning = json?.unlock?.wasRunning ?? false;
              Alert.alert(
                "Match eliminati",
                `Eliminati ${bb} biker-biker + ${bz} biker-zavorrina (totale ${bb + bz}).${
                  wasRunning ? "\nLock 'isMatchingRunning' rimosso." : ""
                }`,
              );
              setTimeout(() => setResetMatchesStatus("idle"), 3000);
              queryClient.invalidateQueries({ queryKey: ["/api/admin/matching-stats"] });
              queryClient.invalidateQueries({ queryKey: ["/api/admin/match-settings"] });
              refetch();
              refetchLock();
            } catch {
              setResetMatchesStatus("idle");
              Alert.alert("Errore", "Impossibile eseguire il reset dei match.");
            }
          },
        },
      ],
    );
  };

  const handleRecalcAll = async () => {
    Alert.alert(
      "Ricalcola tutto",
      "Avviare un ciclo completo del motore di matching per tutti gli utenti?",
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Avvia",
          style: "default",
          onPress: async () => {
            try {
              setRecalcStatus("running");
              const res = await apiRequest("POST", "/api/admin/matches/recalculate-all");
              const json = await res.json();
              setRecalcStatus("done");
              if (json.started) {
                Alert.alert("Ciclo avviato", "Il motore di matching è stato avviato in background.");
              } else {
                Alert.alert("Non avviato", json.reason ?? "Il ciclo non è stato avviato.");
              }
              setTimeout(() => setRecalcStatus("idle"), 3000);
              refetch();
            } catch {
              setRecalcStatus("idle");
              Alert.alert("Errore", "Impossibile avviare il ricalcolo.");
            }
          },
        },
      ],
    );
  };

  return (
    <View>
      <TouchableOpacity
        style={[
          styles.recalcAllBtn,
          recalcStatus === "running" && { opacity: 0.7 },
          recalcStatus === "done" && { backgroundColor: Colors.success },
        ]}
        onPress={handleRecalcAll}
        disabled={recalcStatus === "running"}
        activeOpacity={0.8}
      >
        {recalcStatus === "running" ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : recalcStatus === "done" ? (
          <Ionicons name="checkmark-circle" size={20} color="#fff" />
        ) : (
          <MaterialCommunityIcons name="refresh-circle" size={20} color="#fff" />
        )}
        <Text style={styles.recalcAllText}>
          {recalcStatus === "running"
            ? "Avvio in corso..."
            : recalcStatus === "done"
            ? "Ciclo avviato!"
            : "Ricalcola tutto"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.unlockBtn,
          unlockStatus === "running" && { opacity: 0.7 },
          unlockStatus === "done" && { backgroundColor: Colors.success, borderColor: Colors.success },
        ]}
        onPress={handleForceUnlock}
        disabled={unlockStatus === "running"}
        activeOpacity={0.8}
      >
        {unlockStatus === "running" ? (
          <ActivityIndicator size="small" color={Colors.accent} />
        ) : unlockStatus === "done" ? (
          <Ionicons name="checkmark-circle" size={20} color="#fff" />
        ) : (
          <MaterialCommunityIcons name="lock-open-variant" size={20} color={Colors.accent} />
        )}
        <Text style={[styles.unlockText, unlockStatus === "done" && { color: "#fff" }]}>
          {unlockStatus === "running"
            ? "Sblocco in corso..."
            : unlockStatus === "done"
            ? "Engine sbloccato!"
            : "Forza sblocco engine"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.dangerBtn,
          resetMatchesStatus === "running" && { opacity: 0.7 },
          resetMatchesStatus === "done" && { backgroundColor: Colors.success, borderColor: Colors.success },
        ]}
        onPress={handleResetMatches}
        disabled={resetMatchesStatus === "running"}
        activeOpacity={0.8}
      >
        {resetMatchesStatus === "running" ? (
          <ActivityIndicator size="small" color={Colors.error} />
        ) : resetMatchesStatus === "done" ? (
          <Ionicons name="checkmark-circle" size={20} color="#fff" />
        ) : (
          <MaterialCommunityIcons name="delete-sweep" size={20} color={Colors.error} />
        )}
        <Text style={[styles.dangerText, resetMatchesStatus === "done" && { color: "#fff" }]}>
          {resetMatchesStatus === "running"
            ? "Eliminazione in corso..."
            : resetMatchesStatus === "done"
            ? "Match eliminati!"
            : "Reset completo match (DB)"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.resetAllBtn,
          resetStatus === "running" && { opacity: 0.7 },
          resetStatus === "done" && { backgroundColor: Colors.success, borderColor: Colors.success },
        ]}
        onPress={handleResetAll}
        disabled={resetStatus === "running"}
        activeOpacity={0.8}
      >
        {resetStatus === "running" ? (
          <ActivityIndicator size="small" color={Colors.warning} />
        ) : resetStatus === "done" ? (
          <Ionicons name="checkmark-circle" size={20} color="#fff" />
        ) : (
          <MaterialCommunityIcons name="restore" size={20} color={Colors.warning} />
        )}
        <Text
          style={[
            styles.resetAllText,
            resetStatus === "done" && { color: "#fff" },
          ]}
        >
          {resetStatus === "running"
            ? "Reset in corso..."
            : resetStatus === "done"
            ? "Reset completato!"
            : "Reset preferenze utenti"}
        </Text>
      </TouchableOpacity>

      {/* Task #2527 — estratto in components/admin/matching/AnomalyAlerts.tsx */}
      <AnomalyAlerts count={anomaliesCount} />
    </View>
  );
}
