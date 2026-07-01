// Task #5228 — Monitor diagnostico "Bowie · Standalone" (client APK Bowie Terminal).
// Mostra SOLO metadati: nessun contenuto dei messaggi viene mai richiesto o mostrato.
import React from "react";
import {
  ScrollView, View, Text, StyleSheet, ActivityIndicator,
  RefreshControl, TouchableOpacity, Alert,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { apiRequest } from "@/lib/query-client";
import Colors from "@/constants/colors";

interface ActivityRow {
  id: string;
  createdAt: string;
  persona: string | null;
  provider: string | null;
  modelId: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  degraded: boolean | null;
  securityBlocked: boolean | null;
  userId: string | null;
}
interface SecurityRow {
  createdAt: string;
  userId: string | null;
}
interface PersonaSlice {
  id: string;
  name: string;
  count: number;
  pct: number;
}
interface DeviceRow {
  id: string;
  deviceId: string;
  userId: string | null;
  nickname: string | null;
  createdAt: string;
  lastActiveAt: string;
  active: boolean;
}
interface StatsResp {
  connection: { registered: number; active: number };
  recentActivity: ActivityRow[];
  notifications: { sent: number; delivered: number; failed: number };
  securityBlocks: SecurityRow[];
  personaBreakdown: PersonaSlice[];
  personaTotal: number;
  devices: DeviceRow[];
}

const PERSONA_COLORS: Record<string, string> = {
  bowie: "#FF6600",
  horus: "#3B82F6",
  ares: "#E63946",
};

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("it-IT", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

export default function BowieStandaloneScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const statsQ = useQuery<StatsResp>({
    queryKey: ["/api/admin/bowie-standalone/stats"],
    refetchInterval: 30_000,
    retry: 1,
  });

  const revokeM = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/admin/bowie-standalone/token/${id}`);
      if (!res.ok) throw new Error("revoke_failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/bowie-standalone/stats"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/bowie-standalone/badge"] });
    },
    onError: () => Alert.alert("Errore", "Impossibile revocare il dispositivo."),
  });

  function confirmRevoke(d: DeviceRow) {
    const who = d.nickname ?? d.userId ?? d.deviceId;
    Alert.alert(
      "Revoca dispositivo",
      `Revocare il token push di "${who}"? Il dispositivo non riceverà più notifiche finché non si registra di nuovo.`,
      [
        { text: "Annulla", style: "cancel" },
        { text: "Revoca", style: "destructive", onPress: () => revokeM.mutate(d.id) },
      ],
    );
  }

  const data = statsQ.data;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32, paddingHorizontal: 14 }}
      refreshControl={
        <RefreshControl
          refreshing={statsQ.isRefetching}
          onRefresh={() => statsQ.refetch()}
          tintColor={Colors.accent}
        />
      }
    >
      <View style={styles.titleRow}>
        <MaterialCommunityIcons name="console" size={24} color={Colors.accent} />
        <Text style={styles.title}>Bowie · Standalone</Text>
      </View>
      <Text style={styles.subtitle}>
        Monitor diagnostico del client Bowie Terminal (solo metadati)
      </Text>

      {statsQ.isLoading && (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.accent} />
        </View>
      )}

      {statsQ.isError && !data && (
        <View style={styles.card}>
          <Text style={styles.errorText}>Errore nel caricamento delle statistiche.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => statsQ.refetch()}>
            <Text style={styles.retryBtnText}>Riprova</Text>
          </TouchableOpacity>
        </View>
      )}

      {data && (
        <>
          {/* Stato connessione */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Stato connessione</Text>
            <View style={styles.statRow}>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{data.connection.registered}</Text>
                <Text style={styles.statLabel}>Token registrati</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statValue, { color: Colors.success }]}>{data.connection.active}</Text>
                <Text style={styles.statLabel}>Attivi (24h)</Text>
              </View>
            </View>
          </View>

          {/* Notifiche oggi */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Notification-reply · oggi</Text>
            <View style={styles.statRow}>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{data.notifications.sent}</Text>
                <Text style={styles.statLabel}>Inviate</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statValue, { color: Colors.success }]}>{data.notifications.delivered}</Text>
                <Text style={styles.statLabel}>Consegnate</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statValue, { color: Colors.error }]}>{data.notifications.failed}</Text>
                <Text style={styles.statLabel}>Fallite</Text>
              </View>
            </View>
          </View>

          {/* Ripartizione persona */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Persona · ultimi {data.personaTotal} turni</Text>
            {data.personaTotal === 0 ? (
              <Text style={styles.emptyText}>Nessun turno registrato.</Text>
            ) : (
              data.personaBreakdown.map((p) => (
                <View key={p.id} style={styles.personaRow}>
                  <View style={styles.personaHeader}>
                    <Text style={styles.personaName}>{p.name}</Text>
                    <Text style={styles.personaPct}>{p.pct}% · {p.count}</Text>
                  </View>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        { width: `${p.pct}%`, backgroundColor: PERSONA_COLORS[p.id] ?? Colors.accent },
                      ]}
                    />
                  </View>
                </View>
              ))
            )}
          </View>

          {/* Blocchi di sicurezza */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              Blocchi di sicurezza{" "}
              {data.securityBlocks.length > 0 && (
                <Text style={styles.badgeInline}>{data.securityBlocks.length}</Text>
              )}
            </Text>
            {data.securityBlocks.length === 0 ? (
              <Text style={styles.emptyText}>Nessun blocco registrato.</Text>
            ) : (
              data.securityBlocks.map((s, i) => (
                <View key={`${s.createdAt}-${i}`} style={styles.listItem}>
                  <MaterialCommunityIcons name="shield-alert" size={16} color={Colors.error} />
                  <Text style={styles.listItemText}>
                    {fmtDateTime(s.createdAt)} · user {s.userId ?? "—"}
                  </Text>
                </View>
              ))
            )}
          </View>

          {/* Attività recente */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Attività recente</Text>
            {data.recentActivity.length === 0 ? (
              <Text style={styles.emptyText}>Nessuna attività recente.</Text>
            ) : (
              data.recentActivity.map((a) => (
                <View key={a.id} style={styles.activityRow}>
                  <View style={styles.activityHeader}>
                    <View style={styles.activityBadgeRow}>
                      <View
                        style={[
                          styles.personaDot,
                          { backgroundColor: PERSONA_COLORS[a.persona ?? ""] ?? Colors.textSecondary },
                        ]}
                      />
                      <Text style={styles.activityPersona}>{a.persona ?? "—"}</Text>
                      {a.degraded ? (
                        <MaterialCommunityIcons name="alert-decagram" size={13} color={Colors.warning} />
                      ) : null}
                      {a.securityBlocked ? (
                        <MaterialCommunityIcons name="shield-alert" size={13} color={Colors.error} />
                      ) : null}
                    </View>
                    <Text style={styles.activityTime}>{fmtDateTime(a.createdAt)}</Text>
                  </View>
                  <Text style={styles.activityMeta}>
                    {a.provider ?? "—"}{a.modelId ? ` · ${a.modelId}` : ""} · in {a.tokensIn ?? 0} / out {a.tokensOut ?? 0}
                  </Text>
                </View>
              ))
            )}
          </View>

          {/* Dispositivi */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Dispositivi ({data.devices.length})</Text>
            {data.devices.length === 0 ? (
              <Text style={styles.emptyText}>Nessun dispositivo registrato.</Text>
            ) : (
              data.devices.map((d) => (
                <View key={d.id} style={styles.deviceRow}>
                  <View style={styles.deviceInfo}>
                    <View style={styles.deviceNameRow}>
                      <View
                        style={[
                          styles.statusDot,
                          { backgroundColor: d.active ? Colors.success : Colors.textSecondary },
                        ]}
                      />
                      <Text style={styles.deviceName}>{d.nickname ?? d.userId ?? "—"}</Text>
                    </View>
                    <Text style={styles.deviceMeta} numberOfLines={1}>
                      {d.deviceId} · attivo {fmtDateTime(d.lastActiveAt)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.revokeBtn}
                    onPress={() => confirmRevoke(d)}
                    disabled={revokeM.isPending}
                  >
                    <MaterialCommunityIcons name="link-off" size={16} color="#fff" />
                    <Text style={styles.revokeBtnText}>Revoca</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { paddingVertical: 40, alignItems: "center" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { color: Colors.text, fontSize: 22, fontWeight: "700" },
  subtitle: { color: Colors.textSecondary, fontSize: 13, marginTop: 2, marginBottom: 14 },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardTitle: { color: Colors.text, fontSize: 15, fontWeight: "600", marginBottom: 10 },
  errorText: { color: Colors.error, fontSize: 14 },
  emptyText: { color: Colors.textSecondary, fontSize: 13, fontStyle: "italic" },
  retryBtn: {
    marginTop: 10, alignSelf: "flex-start",
    backgroundColor: Colors.accent, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8,
  },
  retryBtnText: { color: "#fff", fontWeight: "600" },
  statRow: { flexDirection: "row", justifyContent: "space-around" },
  statBox: { alignItems: "center", flex: 1 },
  statValue: { color: Colors.text, fontSize: 26, fontWeight: "700" },
  statLabel: { color: Colors.textSecondary, fontSize: 12, marginTop: 2, textAlign: "center" },
  personaRow: { marginBottom: 10 },
  personaHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  personaName: { color: Colors.text, fontSize: 13, fontWeight: "600" },
  personaPct: { color: Colors.textSecondary, fontSize: 12 },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: Colors.surfaceLight, overflow: "hidden" },
  barFill: { height: 8, borderRadius: 4 },
  badgeInline: {
    color: "#fff", backgroundColor: Colors.error,
    fontSize: 12, fontWeight: "700",
    paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8, overflow: "hidden",
  },
  listItem: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 5 },
  listItemText: { color: Colors.textSecondary, fontSize: 13 },
  activityRow: { paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },
  activityHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  activityBadgeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  personaDot: { width: 8, height: 8, borderRadius: 4 },
  activityPersona: { color: Colors.text, fontSize: 13, fontWeight: "600", textTransform: "capitalize" },
  activityTime: { color: Colors.textSecondary, fontSize: 11 },
  activityMeta: { color: Colors.textSecondary, fontSize: 12, marginTop: 3 },
  deviceRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
  },
  deviceInfo: { flex: 1, marginRight: 10 },
  deviceNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusDot: { width: 9, height: 9, borderRadius: 5 },
  deviceName: { color: Colors.text, fontSize: 14, fontWeight: "600" },
  deviceMeta: { color: Colors.textSecondary, fontSize: 11, marginTop: 2 },
  revokeBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: Colors.accentRed, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8,
  },
  revokeBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },
});
