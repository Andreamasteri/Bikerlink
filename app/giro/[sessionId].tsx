import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Share,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/query-client";
import type { IdealLap } from "@/components/profile/types";
import GpsLapTrackMap from "@/components/GpsLapTrackMap";
import {
  PAGE_SIZE,
  SpeedSparkline,
  SampleTable,
  StatTile,
  RenameModal,
  lapDetailStyles,
  type LapSample,
} from "./LapDetailParts";

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

  const {
    data: samplesData,
    isLoading: samplesLoading,
    isError: samplesError,
    refetch: refetchSamples,
  } = useQuery<LapSample[]>({
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
    const date = new Date(lap.startedAt).toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });
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
    setRenameText(lap?.lapName ?? (lap ? `Giro ${lap.lapNumber}` : ""));
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

  const s = lapDetailStyles(colors);

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
        {lap && (
          <View style={s.statsCard}>
            <View style={s.statsGrid}>
              <StatTile icon="navigate-outline" iconColor={colors.accent} value={lap.distanceKm != null ? `${lap.distanceKm.toFixed(2)} km` : "—"} label="Distanza" colors={colors} />
              <StatTile icon="speedometer-outline" iconColor={colors.accent} value={lap.maxSpeedKmh != null ? `${lap.maxSpeedKmh}` : "—"} unit="km/h" label="Vel. max" colors={colors} />
              <StatTile iconComponent={<MaterialCommunityIcons name="rotate-3d-variant" size={18} color="#f39c12" />} value={lap.maxLeanDeg != null ? `${lap.maxLeanDeg}°` : "—"} label="Piega max" colors={colors} />
              <StatTile iconComponent={<MaterialCommunityIcons name="gauge" size={18} color="#9b59b6" />} value={lap.maxGforce != null ? `${lap.maxGforce}g` : "—"} label="G-force max" colors={colors} />
              <StatTile icon="layers-outline" iconColor={colors.textSecondary} value={String(lap.sampleCount)} label="Campioni" colors={colors} />
            </View>
          </View>
        )}

        {samplesData && samplesData.length > 0 && <SpeedSparkline samples={samplesData} />}

        {!samplesLoading && !samplesError && (
          <GpsLapTrackMap
            points={(samplesData ?? [])
              .filter((s) => s.lat != null && s.lon != null)
              .map((s) => ({ lat: s.lat as number, lon: s.lon as number }))}
          />
        )}

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
          <SampleTable samples={samplesData} page={page} onLoadMore={() => setPage((p) => p + 1)} />
        ) : (
          <Text style={s.emptyText}>Nessun campione disponibile per questo giro.</Text>
        )}

        <TouchableOpacity style={s.deleteBtn} onPress={handleDelete} disabled={deleteMutation.isPending}>
          {deleteMutation.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="trash-outline" size={18} color="#fff" />
          )}
          <Text style={s.deleteBtnText}>Elimina giro</Text>
        </TouchableOpacity>
      </ScrollView>

      <RenameModal
        visible={renameVisible}
        renameText={renameText}
        onChangeText={setRenameText}
        onClose={() => setRenameVisible(false)}
        onConfirm={handleRenameConfirm}
        isPending={renameMutation.isPending}
      />
    </View>
  );
}
