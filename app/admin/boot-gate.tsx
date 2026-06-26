// Task #4979 — pannello admin del BootGate: stato in tempo reale dei ping (Livello B)
// e interruttore remoto per attivare la diagnostica sui device al prossimo avvio.
import React, { useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { apiRequest } from "@/lib/query-client";
import { getBootStep } from "@/lib/boot-gate-steps";

interface BootPingEntry {
  step: string;
  status: string;
  ts: number;
  note: string | null;
}

interface DeviceState {
  deviceId: string;
  platform: string | null;
  appVersion: string | null;
  firstSeen: number;
  lastSeen: number;
  entryCount: number;
  lastEntry: BootPingEntry | null;
  entries: BootPingEntry[];
}

interface StatusResponse {
  bootGateEnabled: boolean;
  lastDeviceId: string | null;
  devices: DeviceState[];
}

function statusGlyph(status: string): string {
  switch (status) {
    case "passed":
      return "✅";
    case "stopped":
      return "⛔";
    case "skipped":
      return "»";
    case "mounting":
      return "⏳";
    case "reached":
      return "▶";
    default:
      return "·";
  }
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function BootGateAdminScreen() {
  const colors = useColors();
  const s = styles(colors);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch, isFetching } = useQuery<StatusResponse>({
    queryKey: ["/api/debug/boot-gate/status"],
    refetchInterval: 5_000,
  });

  const enableMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await apiRequest("POST", "/api/debug/boot-gate/enable", { enabled });
      return (await res.json()) as { bootGateEnabled: boolean };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/debug/boot-gate/status"] });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/debug/boot-gate/reset");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/debug/boot-gate/status"] });
    },
  });

  const renderDevice = useCallback(
    ({ item }: { item: DeviceState }) => {
      const culprit = item.entries.find((e) => e.status === "stopped");
      const last = item.lastEntry;
      const lastStep = last ? getBootStep(last.step) : undefined;
      return (
        <View style={s.card}>
          <View style={s.cardHeader}>
            <Text style={s.deviceId} numberOfLines={1}>
              {item.platform ?? "?"} · {item.deviceId}
            </Text>
            <Text style={s.appVersion}>{item.appVersion ?? "—"}</Text>
          </View>

          {culprit ? (
            <View style={s.culpritBanner}>
              <Text style={s.culpritText}>
                ⛔ Bug a: {getBootStep(culprit.step)?.label ?? culprit.step}
              </Text>
              {culprit.note ? <Text style={s.culpritNote}>{culprit.note}</Text> : null}
            </View>
          ) : last ? (
            <View style={s.lastBanner}>
              <Text style={s.lastText}>
                {statusGlyph(last.status)} Ultimo: {lastStep?.label ?? last.step} ({last.status})
              </Text>
            </View>
          ) : null}

          <View style={s.timeline}>
            {item.entries.slice(-30).map((e, i) => {
              const step = getBootStep(e.step);
              return (
                <View key={`${e.step}-${e.ts}-${i}`} style={s.entryRow}>
                  <Text style={s.entryGlyph}>{statusGlyph(e.status)}</Text>
                  <Text style={s.entryLabel} numberOfLines={1}>
                    {step?.label ?? e.step}
                  </Text>
                  <Text style={s.entryStatus}>{e.status}</Text>
                  <Text style={s.entryTime}>{formatTime(e.ts)}</Text>
                </View>
              );
            })}
          </View>
        </View>
      );
    },
    [s],
  );

  if (isLoading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (isError || !data) {
    return (
      <View style={s.center}>
        <Text style={s.errorText}>Errore nel caricamento dello stato BootGate</Text>
        <TouchableOpacity style={s.retryBtn} onPress={() => void refetch()}>
          <Text style={s.retryText}>Riprova</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const enabled = data.bootGateEnabled;

  return (
    <View style={s.container}>
      <View style={[s.toggleCard, enabled ? s.toggleOn : s.toggleOff]}>
        <View style={s.toggleTextWrap}>
          <Text style={s.toggleTitle}>
            {enabled ? "🟢 BootGate ATTIVO" : "⚪ BootGate spento"}
          </Text>
          <Text style={s.toggleHint}>
            {enabled
              ? "I device admin entreranno nella diagnostica al prossimo avvio."
              : "Attivalo, poi riavvia l'app sul device da diagnosticare."}
          </Text>
        </View>
        <TouchableOpacity
          style={[s.toggleBtn, enabled ? s.toggleBtnOff : s.toggleBtnOn]}
          onPress={() => enableMutation.mutate(!enabled)}
          disabled={enableMutation.isPending}
        >
          <Text style={s.toggleBtnText}>
            {enableMutation.isPending ? "..." : enabled ? "Disattiva" : "Attiva"}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={s.listHeader}>
        <Text style={s.listTitle}>
          Device ({data.devices.length}) · ping in tempo reale
        </Text>
        <View style={s.headerActions}>
          <TouchableOpacity onPress={() => resetMutation.mutate()} disabled={resetMutation.isPending}>
            <Text style={s.resetBtn}>🗑 Reset</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => void refetch()} disabled={isFetching}>
            <Text style={[s.refreshBtn, isFetching && s.refreshDisabled]}>
              {isFetching ? "..." : "↻"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={data.devices}
        keyExtractor={(d) => d.deviceId}
        renderItem={renderDevice}
        contentContainerStyle={s.list}
        ListEmptyComponent={
          <Text style={s.empty}>
            Nessun ping ricevuto. Attiva il BootGate e riavvia l&apos;app sul device.
          </Text>
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
    errorText: { color: colors.error ?? "#e55", fontSize: 14 },
    retryBtn: {
      paddingHorizontal: 20,
      paddingVertical: 8,
      backgroundColor: colors.accent,
      borderRadius: 8,
    },
    retryText: { color: "#fff", fontFamily: "Inter_600SemiBold" },

    toggleCard: {
      flexDirection: "row",
      alignItems: "center",
      margin: 16,
      padding: 16,
      borderRadius: 12,
      gap: 12,
    },
    toggleOn: { backgroundColor: "#1a3a1a" },
    toggleOff: { backgroundColor: colors.surface },
    toggleTextWrap: { flex: 1, gap: 4 },
    toggleTitle: { color: colors.text, fontFamily: "Inter_700Bold", fontSize: 15 },
    toggleHint: { color: colors.textSecondary ?? colors.text, fontSize: 12, lineHeight: 17 },
    toggleBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
    toggleBtnOn: { backgroundColor: "#238636" },
    toggleBtnOff: { backgroundColor: "#6e7681" },
    toggleBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 13 },

    listHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
    listTitle: { color: colors.text, fontFamily: "Inter_600SemiBold", fontSize: 14, flex: 1 },
    headerActions: { flexDirection: "row", gap: 16, alignItems: "center" },
    resetBtn: { color: colors.error ?? "#e55", fontSize: 13, fontFamily: "Inter_500Medium" },
    refreshBtn: { color: colors.accent, fontSize: 18, fontFamily: "Inter_500Medium" },
    refreshDisabled: { opacity: 0.4 },

    list: { paddingHorizontal: 12, paddingBottom: 32 },
    empty: {
      color: colors.textSecondary ?? colors.text,
      textAlign: "center",
      marginTop: 40,
      paddingHorizontal: 24,
      lineHeight: 20,
    },

    card: {
      backgroundColor: colors.surface,
      borderRadius: 10,
      padding: 12,
      marginBottom: 10,
      gap: 8,
    },
    cardHeader: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
    deviceId: { color: colors.text, fontFamily: "Inter_600SemiBold", fontSize: 13, flex: 1 },
    appVersion: { color: colors.textSecondary ?? colors.text, fontSize: 12 },

    culpritBanner: { backgroundColor: "#3a1a1a", borderRadius: 8, padding: 8 },
    culpritText: { color: "#ff8080", fontFamily: "Inter_700Bold", fontSize: 13 },
    culpritNote: { color: "#ffb0b0", fontSize: 12, marginTop: 2 },
    lastBanner: { backgroundColor: colors.background, borderRadius: 8, padding: 8 },
    lastText: { color: colors.text, fontSize: 13 },

    timeline: { gap: 2 },
    entryRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    entryGlyph: { width: 18, fontSize: 12, textAlign: "center" },
    entryLabel: { color: colors.text, fontSize: 12, flex: 1 },
    entryStatus: { color: colors.textSecondary ?? colors.text, fontSize: 10, width: 64 },
    entryTime: { color: colors.textSecondary ?? colors.text, fontSize: 10, opacity: 0.6, width: 56, textAlign: "right" },
  });
