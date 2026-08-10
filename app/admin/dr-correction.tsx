import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import Colors from "@/constants/colors";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";
import { BLEND_SMOOTHING_K } from "@shared/dr-correction";

interface DrUser {
  userId: string;
  username: string;
  isTest: boolean;
  distanceScale: number;
  speedScale: number;
  speedBiasKmh: number;
  headingBiasDeg: number;
  sampleCount: number;
  meanPosErrorM: number;
  meanSpeedErrorKmh: number;
  updatedAt: string | null;
  lastSampleAt: string | null;
  effective?: {
    distanceScale: number;
    speedScale: number;
    speedBiasKmh: number;
    headingBiasDeg: number;
  };
}

interface DrUsersResponse {
  users: DrUser[];
  total: number;
  page: number;
  limit: number;
}

interface DrGlobal {
  distanceScale: number;
  speedScale: number;
  speedBiasKmh: number;
  headingBiasDeg: number;
  sampleCount: number;
  contributingUsers: number;
  meanPosErrorM: number;
  meanSpeedErrorKmh: number;
  updatedAt: string | null;
}

async function fetchDrUsers(page: number): Promise<DrUsersResponse> {
  const url = new URL(`/api/admin/dr-correction/users?page=${page}&limit=50`, getApiUrl());
  const res = await fetch(url.toString(), {
    headers: { ...(await authFetchHeaders()) },
    credentials: "include",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchDrGlobal(): Promise<{ global: DrGlobal | null }> {
  const url = new URL(`/api/admin/dr-correction/global`, getApiUrl());
  const res = await fetch(url.toString(), {
    headers: { ...(await authFetchHeaders()) },
    credentials: "include",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function exportUser(userId: string, username: string): Promise<void> {
  const url = new URL(`/api/admin/dr-correction/users/${userId}/export`, getApiUrl()).toString();
  const headers = { ...(await authFetchHeaders()) };
  if (Platform.OS === "web") {
    const res = await fetch(url, { headers, credentials: "include" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = `dr-correction-${userId}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(objUrl); }, 1000);
    return;
  }
  const res = await fetch(url, { headers, credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const safeName = username.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 24);
  const filePath = `${FileSystem.cacheDirectory}dr-correction-${safeName}-${userId}.json`;
  await FileSystem.writeAsStringAsync(filePath, text, { encoding: FileSystem.EncodingType.UTF8 });
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) throw new Error("Condivisione non disponibile su questo dispositivo");
  await Sharing.shareAsync(filePath, { mimeType: "application/json", UTI: "public.json" });
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("it-IT", {
      day: "2-digit", month: "2-digit", year: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function GlobalCard({ g }: { g: DrGlobal | null }) {
  return (
    <View style={styles.globalCard}>
      <View style={styles.globalHeader}>
        <MaterialCommunityIcons name="earth" size={16} color={Colors.accent} />
        <Text style={styles.globalTitle}>Modello globale (esclusi utenti di test)</Text>
      </View>
      {g ? (
        <>
          <View style={styles.metricRow}>
            <Metric label="scala dist." value={g.distanceScale.toFixed(3)} />
            <Metric label="scala vel." value={g.speedScale.toFixed(3)} />
            <Metric label="bias vel." value={`${g.speedBiasKmh.toFixed(1)} km/h`} />
            <Metric label="bias head." value={`${g.headingBiasDeg.toFixed(1)}°`} />
          </View>
          <View style={styles.metricRow}>
            <Metric label="campioni" value={String(g.sampleCount)} />
            <Metric label="utenti" value={String(g.contributingUsers)} />
            <Metric label="err. pos." value={`${g.meanPosErrorM.toFixed(0)} m`} />
            <Metric label="err. vel." value={`${g.meanSpeedErrorKmh.toFixed(1)}`} />
          </View>
          <Text style={styles.globalUpdated}>Aggiornato: {formatDate(g.updatedAt)}</Text>
        </>
      ) : (
        <Text style={styles.globalEmpty}>Aggregato globale non ancora calcolato.</Text>
      )}
    </View>
  );
}

function UserCard({
  item,
  onExport,
  exporting,
  onRecompute,
  recomputing,
}: {
  item: DrUser;
  onExport: () => void;
  exporting: boolean;
  onRecompute: () => void;
  recomputing: boolean;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <MaterialCommunityIcons name="account-circle" size={30} color={Colors.textSecondary} />
        <View style={styles.cardHead}>
          <Text style={styles.cardUsername} numberOfLines={1}>{item.username}</Text>
          <Text style={styles.cardLast}>{item.sampleCount} campioni · ultimo {formatDate(item.lastSampleAt)}</Text>
        </View>
        {item.isTest && (
          <View style={styles.testBadge}>
            <Text style={styles.testBadgeText}>TEST</Text>
          </View>
        )}
      </View>
      <Text style={styles.sectionLabel}>Appreso (grezzo)</Text>
      <View style={styles.metricRow}>
        <Metric label="scala dist." value={item.distanceScale.toFixed(3)} />
        <Metric label="scala vel." value={item.speedScale.toFixed(3)} />
        <Metric label="bias vel." value={`${item.speedBiasKmh.toFixed(1)}`} />
        <Metric label="bias head." value={`${item.headingBiasDeg.toFixed(1)}°`} />
      </View>
      {item.effective && (
        <>
          <Text style={styles.sectionLabel}>Effettivo (applicato)</Text>
          <View style={styles.metricRow}>
            <Metric label="scala dist." value={item.effective.distanceScale.toFixed(3)} />
            <Metric label="scala vel." value={item.effective.speedScale.toFixed(3)} />
            <Metric label="bias vel." value={`${item.effective.speedBiasKmh.toFixed(1)}`} />
            <Metric label="bias head." value={`${item.effective.headingBiasDeg.toFixed(1)}°`} />
          </View>
          <View style={styles.blendNote}>
            <MaterialCommunityIcons name="information-outline" size={13} color={Colors.textSecondary} />
            <Text style={styles.blendNoteText}>
              L&apos;<Text style={styles.blendNoteEmph}>effettivo</Text> è ciò che il client applica: il
              modello grezzo fuso col globale, smorzato dai campioni (peso = n/(n+{BLEND_SMOOTHING_K})).
              Con pochi dati resta vicino al globale; con più dati converge al grezzo.
            </Text>
          </View>
        </>
      )}
      <View style={styles.metricRow}>
        <Metric label="err. pos. medio" value={`${item.meanPosErrorM.toFixed(0)} m`} />
        <Metric label="err. vel. medio" value={`${item.meanSpeedErrorKmh.toFixed(1)} km/h`} />
      </View>
      <TouchableOpacity style={styles.recomputeBtn} onPress={onRecompute} activeOpacity={0.8} disabled={recomputing}>
        {recomputing ? (
          <ActivityIndicator size="small" color="#38bdf8" />
        ) : (
          <>
            <MaterialCommunityIcons name="refresh-circle" size={16} color="#38bdf8" />
            <Text style={styles.recomputeBtnText}>Ricalcola con Quebracho</Text>
          </>
        )}
      </TouchableOpacity>
      <TouchableOpacity style={styles.exportBtn} onPress={onExport} activeOpacity={0.8} disabled={exporting}>
        {exporting ? (
          <ActivityIndicator size="small" color={Colors.accent} />
        ) : (
          <>
            <Ionicons name="download-outline" size={15} color={Colors.accent} />
            <Text style={styles.exportBtnText}>Esporta dati (JSON)</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

export default function DrCorrectionScreen() {
  const insets = useSafeAreaInsets();
  const [page] = useState(0);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [recomputingId, setRecomputingId] = useState<string | null>(null);

  const usersQuery = useQuery<DrUsersResponse>({
    queryKey: ["/api/admin/dr-correction/users", page],
    queryFn: () => fetchDrUsers(page),
    staleTime: 30_000,
  });
  const globalQuery = useQuery<{ global: DrGlobal | null }>({
    queryKey: ["/api/admin/dr-correction/global"],
    queryFn: fetchDrGlobal,
    staleTime: 60_000,
  });

  const users = usersQuery.data?.users ?? [];

  const handleRecompute = async (item: DrUser) => {
    setRecomputingId(item.userId);
    try {
      const res = await fetch(
        new URL(`/api/admin/dr-correction/users/${item.userId}/recompute`, getApiUrl()).toString(),
        {
          method: "POST",
          headers: { ...(await authFetchHeaders()) },
          credentials: "include",
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await usersQuery.refetch();
      Alert.alert("Ricalcolo completato", "Quebracho ha coordinato il ricalcolo del modello DR per questo utente.");
    } catch (e) {
      Alert.alert("Errore ricalcolo", e instanceof Error ? e.message : "Impossibile ricalcolare il modello DR");
    } finally {
      setRecomputingId(null);
    }
  };

  const handleExport = async (item: DrUser) => {
    setExportingId(item.userId);
    try {
      await exportUser(item.userId, item.username);
    } catch (e) {
      Alert.alert("Errore export", e instanceof Error ? e.message : "Impossibile esportare i dati");
    } finally {
      setExportingId(null);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="compass-outline" size={20} color={Colors.accent} />
        <Text style={styles.headerTitle}>Correzione Dead Reckoning</Text>
        {usersQuery.data && <Text style={styles.headerCount}>{usersQuery.data.total} modelli</Text>}
      </View>

      {usersQuery.isLoading && <ActivityIndicator style={{ marginTop: 48 }} color={Colors.accent} />}
      {usersQuery.error && <Text style={styles.errorText}>Errore nel caricamento</Text>}

      <FlatList
        data={users}
        keyExtractor={(item) => item.userId}
        ListHeaderComponent={<GlobalCard g={globalQuery.data?.global ?? null} />}
        renderItem={({ item }) => (
          <UserCard
            item={item}
            onExport={() => handleExport(item)}
            exporting={exportingId === item.userId}
            onRecompute={() => handleRecompute(item)}
            recomputing={recomputingId === item.userId}
          />
        )}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingHorizontal: 16 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={usersQuery.isRefetching}
            onRefresh={() => { usersQuery.refetch(); globalQuery.refetch(); }}
            tintColor={Colors.accent}
          />
        }
        ListEmptyComponent={
          !usersQuery.isLoading ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="compass-off-outline" size={40} color={Colors.textSecondary} />
              <Text style={styles.emptyText}>Nessun modello di correzione ancora appreso</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.text, flex: 1 },
  headerCount: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary },
  globalCard: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginTop: 12,
    borderWidth: 1, borderColor: Colors.accent + "33",
  },
  globalHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  globalTitle: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.text },
  globalUpdated: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 8 },
  globalEmpty: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary },
  card: { backgroundColor: Colors.surface, borderRadius: 12, padding: 12, marginTop: 10 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  cardHead: { flex: 1 },
  cardUsername: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.text },
  cardLast: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  testBadge: { backgroundColor: "#f59e0b22", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  testBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: "#f59e0b" },
  sectionLabel: {
    fontFamily: "Inter_600SemiBold", fontSize: 11, color: Colors.textSecondary,
    marginTop: 10, marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.4,
  },
  blendNote: {
    flexDirection: "row", gap: 6, marginTop: 8,
    backgroundColor: Colors.background, borderRadius: 8, padding: 8,
  },
  blendNoteText: {
    flex: 1, fontFamily: "Inter_400Regular", fontSize: 11,
    color: Colors.textSecondary, lineHeight: 15,
  },
  blendNoteEmph: { fontFamily: "Inter_600SemiBold", color: Colors.text },
  metricRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  metric: {
    flex: 1, backgroundColor: Colors.background, borderRadius: 8,
    paddingVertical: 8, paddingHorizontal: 6, alignItems: "center",
  },
  metricValue: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.text },
  metricLabel: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.textSecondary, marginTop: 2 },
  recomputeBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: "#38bdf812", borderWidth: 1, borderColor: "#38bdf833",
    borderRadius: 8, paddingVertical: 9, marginTop: 12,
  },
  recomputeBtnText: { fontFamily: "Inter_500Medium", fontSize: 13, color: "#38bdf8" },
  exportBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: Colors.accent + "18", borderRadius: 8, paddingVertical: 9, marginTop: 12,
  },
  exportBtnText: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.accent },
  errorText: { fontFamily: "Inter_400Regular", fontSize: 14, color: "#ef4444", textAlign: "center", marginTop: 32 },
  emptyState: { alignItems: "center", gap: 12, marginTop: 64 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center" },
});
