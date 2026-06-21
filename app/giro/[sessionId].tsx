import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Share,
  StyleSheet,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/query-client";
import type { IdealLap } from "@/components/profile/types";
import GpsLapTrackMap from "@/components/GpsLapTrackMap";

const PAGE_SIZE = 100;

type LapSample = {
  ts: number;
  speedKmh: number | null;
  leanAngle: number | null;
  gforce: number | null;
  lat: number | null;
  lon: number | null;
};

function SpeedSparkline({ samples }: { samples: LapSample[] }) {
  const colors = useColors();
  const s = sparkStyles(colors);
  const speeds = samples.map((s) => s.speedKmh ?? 0).filter((v) => v > 0);
  if (speeds.length === 0) return null;

  const maxSpeed = Math.max(...speeds);
  const BAR_COUNT = Math.min(60, speeds.length);
  const step = Math.max(1, Math.floor(speeds.length / BAR_COUNT));
  const buckets: number[] = [];
  for (let i = 0; i < speeds.length; i += step) {
    const slice = speeds.slice(i, i + step);
    buckets.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }

  return (
    <View style={s.container}>
      <Text style={s.label}>Velocità nel tempo</Text>
      <View style={s.chart}>
        {buckets.map((val, idx) => {
          const height = maxSpeed > 0 ? Math.max(2, Math.round((val / maxSpeed) * 48)) : 2;
          return (
            <View
              key={idx}
              style={[s.bar, { height, backgroundColor: colors.accent + "CC" }]}
            />
          );
        })}
      </View>
      <View style={s.axisRow}>
        <Text style={s.axisLabel}>0 km/h</Text>
        <Text style={s.axisLabel}>{maxSpeed.toFixed(0)} km/h max</Text>
      </View>
    </View>
  );
}

function SampleTable({ samples, page, onLoadMore }: { samples: LapSample[]; page: number; onLoadMore: () => void }) {
  const colors = useColors();
  const s = tableStyles(colors);
  const visible = samples.slice(0, page * PAGE_SIZE);
  const hasMore = visible.length < samples.length;
  const startTs = samples[0]?.ts ?? 0;

  return (
    <View style={s.container}>
      <Text style={s.title}>Campioni ({samples.length})</Text>
      <View style={s.headerRow}>
        <Text style={[s.cell, s.headerCell, s.tsCell]}>Tempo</Text>
        <Text style={[s.cell, s.headerCell, s.valCell]}>km/h</Text>
        <Text style={[s.cell, s.headerCell, s.valCell]}>Piega°</Text>
        <Text style={[s.cell, s.headerCell, s.valCell]}>G</Text>
        <Text style={[s.cell, s.headerCell, s.gpsCell]}>Lat</Text>
        <Text style={[s.cell, s.headerCell, s.gpsCell]}>Lon</Text>
      </View>
      {visible.map((sample, idx) => {
        const elapsed = ((sample.ts - startTs) / 1000).toFixed(1);
        return (
          <View key={idx} style={[s.row, idx % 2 === 0 && s.rowAlt]}>
            <Text style={[s.cell, s.tsCell]}>{elapsed}s</Text>
            <Text style={[s.cell, s.valCell]}>{sample.speedKmh != null ? sample.speedKmh.toFixed(1) : "—"}</Text>
            <Text style={[s.cell, s.valCell]}>{sample.leanAngle != null ? sample.leanAngle.toFixed(1) : "—"}</Text>
            <Text style={[s.cell, s.valCell]}>{sample.gforce != null ? sample.gforce.toFixed(2) : "—"}</Text>
            <Text style={[s.cell, s.gpsCell]}>{sample.lat != null ? sample.lat.toFixed(5) : "—"}</Text>
            <Text style={[s.cell, s.gpsCell]}>{sample.lon != null ? sample.lon.toFixed(5) : "—"}</Text>
          </View>
        );
      })}
      {hasMore && (
        <TouchableOpacity style={s.loadMore} onPress={onLoadMore}>
          <Text style={s.loadMoreText}>Carica altri ({samples.length - visible.length} rimanenti)</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function IdealLapDetailScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [renameVisible, setRenameVisible] = useState(false);
  const [renameText, setRenameText] = useState("");

  const { data: lapsData, isError: lapsError } = useQuery<IdealLap[]>({
    queryKey: ["/api/telemetry/ideal-laps"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/telemetry/ideal-laps");
      const json = await res.json() as { laps: IdealLap[] };
      return json.laps ?? [];
    },
    staleTime: 30_000,
  });

  const lap = lapsData?.find((l) => l.sessionId === sessionId);

  const { data: samplesData, isLoading: samplesLoading, isError: samplesError, refetch: refetchSamples } = useQuery<LapSample[]>({
    queryKey: ["/api/telemetry/ideal-laps", sessionId, "samples"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/telemetry/ideal-laps/${encodeURIComponent(sessionId ?? "")}/samples`);
      const json = await res.json() as { samples: LapSample[] };
      return json.samples ?? [];
    },
    enabled: !!sessionId,
    staleTime: 60_000,
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      apiRequest("DELETE", `/api/telemetry/ideal-laps/${encodeURIComponent(sessionId ?? "")}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/telemetry/ideal-laps"] });
      router.back();
    },
  });

  const renameMutation = useMutation({
    mutationFn: (name: string) =>
      apiRequest("PATCH", `/api/telemetry/ideal-laps/${encodeURIComponent(sessionId ?? "")}`, { lap_name: name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/telemetry/ideal-laps"] });
      setRenameVisible(false);
    },
    onError: () => {
      Alert.alert("Errore", "Impossibile rinominare il giro. Riprova.");
    },
  });

  const handleDelete = () => {
    const name = lap?.lapName ?? `Giro ${lap?.lapNumber ?? ""}`;
    Alert.alert(
      `Elimina ${name}`,
      "Vuoi eliminare definitivamente questo giro ideale?",
      [
        { text: "Annulla", style: "cancel" },
        { text: "Elimina", style: "destructive", onPress: () => deleteMutation.mutate() },
      ]
    );
  };

  const handleShare = async () => {
    if (!lap) return;
    const name = lap.lapName ?? `Giro ${lap.lapNumber}`;
    const date = new Date(lap.startedAt).toLocaleDateString("it-IT", {
      day: "2-digit", month: "long", year: "numeric",
    });
    const time = new Date(lap.startedAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

    const lines = [
      `🏍️ ${name}`,
      `📅 ${date} alle ${time}`,
      lap.distanceKm != null ? `📍 Distanza: ${lap.distanceKm.toFixed(2)} km` : null,
      lap.maxSpeedKmh != null ? `⚡ Velocità max: ${lap.maxSpeedKmh} km/h` : null,
      lap.maxLeanDeg != null ? `↪️ Piega max: ${lap.maxLeanDeg}°` : null,
      lap.maxGforce != null ? `💪 G-force max: ${lap.maxGforce}g` : null,
      `📊 Campioni: ${lap.sampleCount}`,
      "",
      "Registrato con BikerLink 🔶",
    ].filter(Boolean);

    try {
      await Share.share({ message: lines.join("\n") });
    } catch {
      // dismissed
    }
  };

  const openRename = () => {
    const current = lap?.lapName ?? (lap ? `Giro ${lap.lapNumber}` : "");
    setRenameText(current);
    setRenameVisible(true);
  };

  const handleRenameConfirm = () => {
    const trimmed = renameText.trim();
    if (!trimmed) {
      Alert.alert("Nome non valido", "Inserisci un nome per il giro.");
      return;
    }
    renameMutation.mutate(trimmed);
  };

  const s = styles(colors);

  if (!sessionId || lapsError) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <Ionicons name="alert-circle-outline" size={40} color={colors.accentRed} />
        <Text style={s.errorText}>{lapsError ? "Impossibile caricare i dati del giro." : "Sessione non trovata."}</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16, padding: 8 }}>
          <Text style={{ color: colors.accent, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>← Torna indietro</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const lapName = lap?.lapName ?? (lap ? `Giro ${lap.lapNumber}` : "Giro Ideale");
  const date = lap ? new Date(lap.startedAt).toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" }) : "";
  const time = lap ? new Date(lap.startedAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : "";

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity style={s.headerTitleArea} onPress={openRename} activeOpacity={0.7}>
          <View style={s.titleRow}>
            <Text style={s.headerTitle} numberOfLines={1}>{lapName}</Text>
            <Ionicons name="pencil-outline" size={14} color={colors.textSecondary} style={{ marginLeft: 4 }} />
          </View>
          {date ? <Text style={s.headerSub}>{date} {time}</Text> : null}
        </TouchableOpacity>
        <TouchableOpacity style={s.shareBtn} onPress={handleShare} disabled={!lap}>
          <Ionicons name="share-outline" size={22} color={colors.accent} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Stats summary */}
        {lap && (
          <View style={s.statsCard}>
            <View style={s.statsGrid}>
              <StatTile
                icon="navigate-outline"
                iconColor={colors.accent}
                value={lap.distanceKm != null ? `${lap.distanceKm.toFixed(2)} km` : "—"}
                label="Distanza"
                colors={colors}
              />
              <StatTile
                icon="speedometer-outline"
                iconColor={colors.accent}
                value={lap.maxSpeedKmh != null ? `${lap.maxSpeedKmh}` : "—"}
                unit="km/h"
                label="Vel. max"
                colors={colors}
              />
              <StatTile
                iconComponent={<MaterialCommunityIcons name="rotate-3d-variant" size={18} color="#f39c12" />}
                value={lap.maxLeanDeg != null ? `${lap.maxLeanDeg}°` : "—"}
                label="Piega max"
                colors={colors}
              />
              <StatTile
                iconComponent={<MaterialCommunityIcons name="gauge" size={18} color="#9b59b6" />}
                value={lap.maxGforce != null ? `${lap.maxGforce}g` : "—"}
                label="G-force max"
                colors={colors}
              />
              <StatTile
                icon="layers-outline"
                iconColor={colors.textSecondary}
                value={String(lap.sampleCount)}
                label="Campioni"
                colors={colors}
              />
            </View>
          </View>
        )}

        {/* Sparkline */}
        {samplesData && samplesData.length > 0 && (
          <SpeedSparkline samples={samplesData} />
        )}

        {/* GPS track map */}
        {!samplesLoading && !samplesError && (
          <GpsLapTrackMap
            points={(samplesData ?? [])
              .filter((s) => s.lat != null && s.lon != null)
              .map((s) => ({ lat: s.lat as number, lon: s.lon as number }))}
          />
        )}

        {/* Sample table */}
        {samplesLoading ? (
          <View style={s.loadingRow}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={s.loadingText}>Caricamento campioni...</Text>
          </View>
        ) : samplesError ? (
          <View style={s.errorRow}>
            <Ionicons name="alert-circle-outline" size={20} color={colors.accentRed} />
            <Text style={s.errorRowText}>Impossibile caricare i campioni.</Text>
            <TouchableOpacity onPress={() => refetchSamples()}>
              <Text style={s.retryText}>Riprova</Text>
            </TouchableOpacity>
          </View>
        ) : samplesData && samplesData.length > 0 ? (
          <SampleTable
            samples={samplesData}
            page={page}
            onLoadMore={() => setPage((p) => p + 1)}
          />
        ) : (
          <Text style={s.emptyText}>Nessun campione disponibile per questo giro.</Text>
        )}

        {/* Delete button */}
        <TouchableOpacity
          style={s.deleteBtn}
          onPress={handleDelete}
          disabled={deleteMutation.isPending}
        >
          {deleteMutation.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="trash-outline" size={18} color="#fff" />
          )}
          <Text style={s.deleteBtnText}>Elimina giro</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Rename Modal */}
      <Modal
        visible={renameVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameVisible(false)}
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
                onPress={() => setRenameVisible(false)}
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

function StatTile({
  icon,
  iconColor,
  iconComponent,
  value,
  unit,
  label,
  colors,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  iconComponent?: React.ReactNode;
  value: string;
  unit?: string;
  label: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={tileStyles(colors).tile}>
      {iconComponent ?? (icon ? <Ionicons name={icon} size={18} color={iconColor ?? colors.accent} /> : null)}
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 2 }}>
        <Text style={tileStyles(colors).value}>{value}</Text>
        {unit ? <Text style={tileStyles(colors).unit}>{unit}</Text> : null}
      </View>
      <Text style={tileStyles(colors).label}>{label}</Text>
    </View>
  );
}

const tileStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    tile: {
      flex: 1,
      minWidth: "28%",
      alignItems: "center",
      paddingVertical: 10,
      gap: 4,
    },
    value: {
      fontSize: 16,
      fontFamily: "Inter_700Bold",
      color: colors.text,
    },
    unit: {
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      color: colors.textSecondary,
    },
    label: {
      fontSize: 10,
      fontFamily: "Inter_400Regular",
      color: colors.textSecondary,
      textAlign: "center",
    },
  });

const sparkStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.surface,
      borderRadius: 10,
      padding: 12,
      marginBottom: 12,
    },
    label: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.text,
      marginBottom: 8,
    },
    chart: {
      flexDirection: "row",
      alignItems: "flex-end",
      height: 52,
      gap: 2,
    },
    bar: {
      flex: 1,
      borderRadius: 2,
      minWidth: 3,
    },
    axisRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 4,
    },
    axisLabel: {
      fontSize: 10,
      fontFamily: "Inter_400Regular",
      color: colors.textSecondary,
    },
  });

const tableStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.surface,
      borderRadius: 10,
      padding: 12,
      marginBottom: 12,
    },
    title: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.text,
      marginBottom: 8,
    },
    headerRow: {
      flexDirection: "row",
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      paddingBottom: 4,
      marginBottom: 2,
    },
    row: {
      flexDirection: "row",
      paddingVertical: 3,
    },
    rowAlt: {
      backgroundColor: colors.background,
    },
    cell: {
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      color: colors.text,
    },
    headerCell: {
      fontFamily: "Inter_600SemiBold",
      color: colors.textSecondary,
    },
    tsCell: { width: 48 },
    valCell: { flex: 1, textAlign: "right" },
    gpsCell: { width: 28, textAlign: "center" },
    loadMore: {
      alignItems: "center",
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      marginTop: 4,
    },
    loadMoreText: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.accent,
    },
  });

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    center: { flex: 1, justifyContent: "center", alignItems: "center" },
    errorText: { fontSize: 14, fontFamily: "Inter_400Regular", color: colors.accentRed },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 10,
    },
    backBtn: { padding: 4 },
    shareBtn: { padding: 4 },
    headerTitleArea: { flex: 1 },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    headerTitle: {
      fontSize: 16,
      fontFamily: "Inter_700Bold",
      color: colors.text,
      flexShrink: 1,
    },
    headerSub: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.textSecondary,
      marginTop: 2,
    },
    scroll: { padding: 16 },
    statsCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      paddingHorizontal: 8,
      paddingVertical: 4,
      marginBottom: 12,
    },
    statsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-around",
    },
    loadingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 20,
    },
    loadingText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.textSecondary,
    },
    emptyText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.textSecondary,
      paddingVertical: 16,
      textAlign: "center",
    },
    errorRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 16,
      flexWrap: "wrap",
    },
    errorRowText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.accentRed,
      flex: 1,
    },
    retryText: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.accent,
      paddingHorizontal: 4,
    },
    deleteBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: colors.accentRed,
      borderRadius: 10,
      paddingVertical: 14,
      marginTop: 8,
    },
    deleteBtnText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: "#fff",
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
