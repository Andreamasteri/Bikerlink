import React, { useCallback, useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/query-client";
import type { IdealLap } from "@/components/profile/types";

function useIdealLaps() {
  return useQuery<IdealLap[]>({
    queryKey: ["/api/telemetry/ideal-laps"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/telemetry/ideal-laps");
      // Guard: la risposta può avere una shape inattesa se il server restituisce
      // un formato diverso da { laps: IdealLap[] }. Se json.laps non è un array
      // (es. undefined, null, oggetto generico), laps.map() sarebbe undefined
      // e causerebbe un "TypeError: undefined is not a function".
      const json = await res.json() as { laps?: unknown };
      return Array.isArray(json?.laps) ? (json.laps as IdealLap[]) : [];
    },
    staleTime: 30_000,
  });
}

export function SavedLapsArchive() {
  const colors = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: laps, isLoading, isError } = useIdealLaps();

  const [renamingLap, setRenamingLap] = useState<IdealLap | null>(null);
  const [renameText, setRenameText] = useState("");

  const deleteMutation = useMutation({
    mutationFn: (sessionId: string) =>
      apiRequest("DELETE", `/api/telemetry/ideal-laps/${encodeURIComponent(sessionId)}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/telemetry/ideal-laps"] });
    },
  });

  // La mutation è ref-stabile nei metodi (.mutate) ma cambia riferimento a ogni
  // transizione di stato: tenerla in un ref evita di rigenerare handleDelete — e
  // a cascata le righe — quando si elimina un giro. exhaustive-deps esenta i ref.
  const deleteMutationRef = useRef(deleteMutation);
  deleteMutationRef.current = deleteMutation;

  const renameMutation = useMutation({
    mutationFn: ({ sessionId, name }: { sessionId: string; name: string }) =>
      apiRequest("PATCH", `/api/telemetry/ideal-laps/${encodeURIComponent(sessionId)}`, { lap_name: name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/telemetry/ideal-laps"] });
      setRenamingLap(null);
    },
    onError: () => {
      Alert.alert("Errore", "Impossibile rinominare il giro. Riprova.");
    },
  });

  const handleDelete = useCallback((lap: IdealLap) => {
    const name = lap.lapName ?? `Giro ${lap.lapNumber}`;
    Alert.alert(
      `Elimina ${name}`,
      "Vuoi eliminare questo giro ideale salvato?",
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Elimina",
          style: "destructive",
          onPress: () => deleteMutationRef.current.mutate(lap.sessionId),
        },
      ]
    );
  }, []);

  const openRename = useCallback((lap: IdealLap) => {
    setRenameText(lap.lapName ?? `Giro ${lap.lapNumber}`);
    setRenamingLap(lap);
  }, []);

  const handleRenameConfirm = () => {
    if (!renamingLap) return;
    const trimmed = renameText.trim();
    if (!trimmed) {
      Alert.alert("Nome non valido", "Inserisci un nome per il giro.");
      return;
    }
    renameMutation.mutate({ sessionId: renamingLap.sessionId, name: trimmed });
  };

  const s = styles(colors);

  if (isLoading) {
    return (
      <View style={s.container}>
        <View style={s.header}>
          <MaterialCommunityIcons name="flag-checkered" size={16} color={colors.accent} />
          <Text style={s.title}>Giri Ideali Salvati</Text>
        </View>
        <View style={s.loadingRow}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={s.loadingText}>Caricamento...</Text>
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={s.container}>
        <View style={s.header}>
          <MaterialCommunityIcons name="flag-checkered" size={16} color={colors.accent} />
          <Text style={s.title}>Giri Ideali Salvati</Text>
        </View>
        <Text style={s.errorText}>Impossibile caricare i giri salvati.</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <MaterialCommunityIcons name="flag-checkered" size={16} color={colors.accent} />
        <Text style={s.title}>Giri Ideali Salvati ({laps?.length ?? 0})</Text>
      </View>

      {(!laps || !Array.isArray(laps) || laps.length === 0) ? (
        <View style={s.emptyState}>
          <Ionicons name="timer-outline" size={36} color={colors.textSecondary} />
          <Text style={s.emptyTitle}>Nessun giro salvato ancora</Text>
          <Text style={s.emptySubtitle}>
            Usa il Giro Ideale per registrare la tua prima sessione.
          </Text>
        </View>
      ) : (
        laps.map((lap) => {
          const date = new Date(lap.startedAt);
          const dateStr = date.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "2-digit" });
          const timeStr = date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
          const name = lap.lapName ?? `Giro ${lap.lapNumber}`;

          return (
            <View key={lap.sessionId} style={s.cardRow}>
              <TouchableOpacity
                style={s.card}
                onPress={() => router.push(`/giro/${encodeURIComponent(lap.sessionId)}` as never)}
                activeOpacity={0.75}
              >
                <View style={s.cardLeft}>
                  <Text style={s.cardName} numberOfLines={1}>{name}</Text>
                  <Text style={s.cardDate}>{dateStr} {timeStr}</Text>
                  <View style={s.statsRow}>
                    {lap.distanceKm != null && (
                      <View style={s.statItem}>
                        <Ionicons name="navigate-outline" size={10} color={colors.textSecondary} />
                        <Text style={s.statVal}>{lap.distanceKm.toFixed(2)} km</Text>
                      </View>
                    )}
                    <View style={s.statItem}>
                      <Ionicons name="speedometer-outline" size={10} color={colors.accent} />
                      <Text style={s.statVal}>{lap.maxSpeedKmh != null ? `${lap.maxSpeedKmh} km/h` : "—"}</Text>
                    </View>
                    <View style={s.statItem}>
                      <MaterialCommunityIcons name="rotate-3d-variant" size={10} color="#f39c12" />
                      <Text style={s.statVal}>{lap.maxLeanDeg != null ? `${lap.maxLeanDeg}°` : "—"}</Text>
                    </View>
                    <View style={s.statItem}>
                      <MaterialCommunityIcons name="gauge" size={10} color="#9b59b6" />
                      <Text style={s.statVal}>{lap.maxGforce != null ? `${lap.maxGforce}g` : "—"}</Text>
                    </View>
                    <Text style={s.samples}>{lap.sampleCount} c.</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} style={{ paddingLeft: 4 }} />
              </TouchableOpacity>
              <TouchableOpacity
                style={s.actionBtn}
                onPress={() => openRename(lap)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="pencil-outline" size={16} color={colors.accent} />
              </TouchableOpacity>
              <TouchableOpacity
                style={s.actionBtn}
                onPress={() => handleDelete(lap)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="trash-outline" size={16} color={colors.accentRed} />
              </TouchableOpacity>
            </View>
          );
        })
      )}

      {/* Rename Modal */}
      <Modal
        visible={!!renamingLap}
        transparent
        animationType="fade"
        onRequestClose={() => setRenamingLap(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={s.modalOverlay}
        >
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Rinomina giro</Text>
            <TextInput
              style={s.modalInput}
              value={renameText}
              onChangeText={setRenameText}
              placeholder="Nome del giro"
              placeholderTextColor={colors.textSecondary}
              maxLength={40}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleRenameConfirm}
            />
            <Text style={s.modalCounter}>{renameText.length}/40</Text>
            <View style={s.modalBtns}>
              <TouchableOpacity
                style={[s.modalBtn, s.modalBtnCancel]}
                onPress={() => setRenamingLap(null)}
                disabled={renameMutation.isPending}
              >
                <Text style={s.modalBtnCancelText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalBtn, s.modalBtnConfirm]}
                onPress={handleRenameConfirm}
                disabled={renameMutation.isPending || !renameText.trim()}
              >
                {renameMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={s.modalBtnConfirmText}>Salva</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    container: {
      marginTop: 16,
      marginBottom: 8,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 10,
    },
    title: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.text,
    },
    loadingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 12,
    },
    loadingText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.textSecondary,
    },
    errorText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.accentRed,
      paddingVertical: 8,
    },
    emptyState: {
      alignItems: "center",
      paddingVertical: 24,
      gap: 8,
    },
    emptyTitle: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.textSecondary,
      textAlign: "center",
    },
    emptySubtitle: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.textSecondary,
      textAlign: "center",
      paddingHorizontal: 16,
    },
    cardRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 6,
      gap: 6,
    },
    card: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardLeft: {
      flex: 1,
      gap: 2,
    },
    cardName: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.text,
    },
    cardDate: {
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      color: colors.textSecondary,
      marginTop: 1,
    },
    statsRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 4,
      flexWrap: "wrap",
    },
    statItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
    },
    statVal: {
      fontSize: 11,
      fontFamily: "Inter_500Medium",
      color: colors.text,
    },
    samples: {
      fontSize: 10,
      fontFamily: "Inter_400Regular",
      color: colors.textSecondary,
    },
    actionBtn: {
      padding: 4,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.55)",
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 24,
    },
    modalCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 20,
      width: "100%",
    },
    modalTitle: {
      fontSize: 16,
      fontFamily: "Inter_700Bold",
      color: colors.text,
      marginBottom: 14,
    },
    modalInput: {
      backgroundColor: colors.background,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.text,
    },
    modalCounter: {
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      color: colors.textSecondary,
      textAlign: "right",
      marginTop: 4,
      marginBottom: 16,
    },
    modalBtns: {
      flexDirection: "row",
      gap: 10,
    },
    modalBtn: {
      flex: 1,
      borderRadius: 8,
      paddingVertical: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    modalBtnCancel: {
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
    },
    modalBtnCancelText: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.text,
    },
    modalBtnConfirm: {
      backgroundColor: colors.accent,
    },
    modalBtnConfirmText: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: "#fff",
    },
  });
