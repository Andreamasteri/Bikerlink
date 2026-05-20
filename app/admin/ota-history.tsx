import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import Colors from "@/constants/colors";
import otaUpdates from "@/ota-updates.json";
import { runManualOtaCheck } from "@/lib/ota-check";
import { useT } from "@/lib/language-context";

interface OtaUpdate {
  updateNumber: number;
  publishedAt?: string;
  message?: string;
  note?: string;
  status?: string;
  platforms?: string[];
  updateGroupId?: string;
  releaseId?: string;
  runtimeVersion?: string;
  runtime_version?: string;
  androidUpdateId?: string | null;
  iosUpdateId?: string | null;
  [key: string]: unknown;
}

interface AdoptionBreakdown {
  release_id: string;
  runtime_version: string;
  phase: string;
  platform: string;
  event_count: number;
  unique_devices: number;
}

interface AdoptionData {
  breakdown: AdoptionBreakdown[];
}

interface OtaProbeView {
  status?: number;
  contentType?: string;
  bodySnippet?: string;
  durationMs?: number;
  error?: string;
}

interface OtaDiagnosticsView {
  errorCode?: string;
  errorCause?: string;
  errorUserInfo?: string;
  nativeStack?: string;
  updateUrl?: string;
  channel?: string;
  networkInfo?: string;
  probe?: OtaProbeView;
}

interface OtaEventRow {
  id: string;
  created_at: string;
  phase: string;
  source: string | null;
  platform: string | null;
  runtime_version: string | null;
  current_update_id: string | null;
  release_id: string | null;
  error: string | null;
  fail_count: number;
  ip: string | null;
  diagnostics: OtaDiagnosticsView | null;
}

interface OtaEventsResponse {
  events: OtaEventRow[];
  limit: number;
  filters?: {
    phase: string | null;
    source: string | null;
    platform: string | null;
    updateId: string | null;
  };
}

interface OtaStatRow {
  current_update_id: string;
  release_id: string;
  runtime_version: string;
  platform: string;
  ok_count: string | number;
  error_count: string | number;
  unique_devices: string | number;
  last_seen: string;
}

interface OtaStatsResponse {
  stats: OtaStatRow[];
}

interface OtaErrorEntry {
  error: string;
  failCount: number;
  updateId: string;
  runtimeVersion: string;
  timestamp: string;
}

interface SystemHealth {
  backendStartedAt: number;
  backendUptimeSec: number;
  events: unknown[];
  otaErrors?: OtaErrorEntry[];
}

const ROME_TZ = "Europe/Rome";

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      timeZone: ROME_TZ,
    });
    const time = d.toLocaleTimeString("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: ROME_TZ,
    });
    return `${date} ${time}`;
  } catch {
    return iso;
  }
}

function formatOtaDate(dateStr?: string): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function statusColor(status?: string): string {
  if (status === "published") return Colors.accent;
  if (status === "superseded") return Colors.textSecondary;
  return Colors.textSecondary;
}

function statusLabel(status?: string): string {
  if (status === "published") return "attivo";
  if (status === "superseded") return "superato";
  return status || "—";
}

export default function OtaHistoryScreen() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const updates = (otaUpdates as OtaUpdate[]).slice().reverse();

  const { data: adoptionData } = useQuery<AdoptionData>({
    queryKey: ["/api/admin/ota-adoption"],
    staleTime: 5 * 60 * 1000,
  });

  const { data: otaStats } = useQuery<OtaStatsResponse>({
    queryKey: ["/api/admin/ota-stats"],
    refetchInterval: 30000,
  });

  const { data: systemHealth } = useQuery<SystemHealth>({
    queryKey: ["/api/admin/system-health"],
    refetchInterval: 30000,
  });

  const [otaFilterPhase, setOtaFilterPhase] = useState("");
  const [otaFilterSource, setOtaFilterSource] = useState("");
  const [otaFilterPlatform, setOtaFilterPlatform] = useState("");
  const [otaFilterUpdateId, setOtaFilterUpdateId] = useState("");

  const otaEventsQueryKey = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", "100");
    if (otaFilterPhase.trim()) params.set("phase", otaFilterPhase.trim());
    if (otaFilterSource.trim()) params.set("source", otaFilterSource.trim());
    if (otaFilterPlatform.trim()) params.set("platform", otaFilterPlatform.trim());
    if (otaFilterUpdateId.trim()) params.set("updateId", otaFilterUpdateId.trim());
    return [`/api/admin/ota-events?${params.toString()}`];
  }, [otaFilterPhase, otaFilterSource, otaFilterPlatform, otaFilterUpdateId]);

  const {
    data: otaEventsData,
    refetch: refetchOtaEvents,
    isFetching: isFetchingOtaEvents,
  } = useQuery<OtaEventsResponse>({
    queryKey: otaEventsQueryKey,
    refetchInterval: 10000,
  });

  const [isManualOtaRunning, setIsManualOtaRunning] = useState(false);
  const handleManualOtaCheck = useCallback(async () => {
    setIsManualOtaRunning(true);
    try {
      const result = await runManualOtaCheck();
      if (result.skipped === "dev") {
        Alert.alert(t("admin.otaUnavailable"), t("admin.otaDevDisabled"));
      } else if (result.skipped === "web") {
        Alert.alert(t("admin.otaUnavailable"), t("admin.otaWebDisabled"));
      } else if (result.ok) {
        Alert.alert(
          "Check OTA completato",
          `Esito: ${result.phase}` +
            (result.phase === "reload" ? "\nL'app sta per ricaricarsi." : ""),
        );
      } else {
        Alert.alert(
          "Check OTA fallito",
          `Phase: ${result.phase}\n${result.error ?? "Errore sconosciuto"}`,
        );
      }
      setTimeout(() => {
        refetchOtaEvents();
      }, 800);
    } catch (e) {
      Alert.alert("Errore", `Impossibile avviare il check OTA: ${String(e)}`);
    } finally {
      setIsManualOtaRunning(false);
    }
  }, [refetchOtaEvents, t]);

  const adoptionByRelease = useMemo(() => {
    const map = new Map<string, number>();
    if (!adoptionData?.breakdown) return map;
    for (const row of adoptionData.breakdown) {
      const prev = map.get(row.release_id) ?? 0;
      map.set(row.release_id, Math.max(prev, row.unique_devices));
    }
    return map;
  }, [adoptionData]);

  const otaErrors = systemHealth?.otaErrors ?? [];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: 16, paddingBottom: insets.bottom + 20 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* ── 1. Storico release OTA ── */}
      <Text style={styles.summary}>{updates.length} aggiornamenti totali</Text>

      {updates.map((u) => {
        const deviceCount = u.releaseId
          ? adoptionByRelease.get(u.releaseId as string)
          : undefined;
        return (
          <View key={u.updateNumber} style={styles.releaseCard}>
            <View style={styles.releaseHeader}>
              <View style={styles.releaseHeaderLeft}>
                <MaterialCommunityIcons
                  name="update"
                  size={16}
                  color={statusColor(u.status)}
                />
                <Text style={[styles.otaNumber, { color: statusColor(u.status) }]}>
                  OTA-{u.updateNumber}
                </Text>
                <View style={styles.rvBadge}>
                  <Text style={styles.rvText}>
                    {u.runtimeVersion ?? u.runtime_version
                      ? `rv ${u.runtimeVersion ?? u.runtime_version}`
                      : "legacy"}
                  </Text>
                </View>
              </View>
              <View style={styles.releaseHeaderRight}>
                {deviceCount !== undefined && deviceCount > 0 && (
                  <View style={styles.adoptionBadge}>
                    <MaterialCommunityIcons name="devices" size={11} color={Colors.accent} />
                    <Text style={styles.adoptionText}>{deviceCount}</Text>
                  </View>
                )}
                <View style={styles.statusBadge}>
                  <Text style={[styles.statusText, { color: statusColor(u.status) }]}>
                    {statusLabel(u.status)}
                  </Text>
                </View>
              </View>
            </View>

            <Text style={styles.releaseMessage}>{u.message || "—"}</Text>

            <View style={styles.releaseMeta}>
              <Text style={styles.releaseMetaText}>{formatOtaDate(u.publishedAt)}</Text>
              {u.platforms && u.platforms.length > 0 && (
                <Text style={styles.releaseMetaText}>{u.platforms.join(", ")}</Text>
              )}
            </View>

            {u.note ? (
              <Text style={styles.releaseNote} numberOfLines={3}>
                {u.note}
              </Text>
            ) : null}
          </View>
        );
      })}

      {/* ── 2. OTA Adoption Card ── */}
      <OtaAdoptionCard stats={otaStats?.stats ?? []} />

      {/* ── 3. OTA Diagnostics Card ── */}
      <OtaDiagnosticsCard events={otaEventsData?.events ?? []} />

      {/* ── 4. Feed eventi OTA con filtri + refresh ── */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="cloud-done-outline" size={18} color={Colors.accent} />
          <Text style={styles.cardTitle}>Aggiornamenti OTA</Text>
          <View style={[styles.badge, { backgroundColor: Colors.accent }]}>
            <Text style={styles.badgeText}>{otaEventsData?.events.length ?? 0}</Text>
          </View>
          <TouchableOpacity
            onPress={() => refetchOtaEvents()}
            disabled={isFetchingOtaEvents}
            style={{ marginLeft: 8 }}
          >
            {isFetchingOtaEvents ? (
              <ActivityIndicator size="small" color={Colors.accent} />
            ) : (
              <Ionicons name="refresh" size={18} color={Colors.accent} />
            )}
          </TouchableOpacity>
        </View>

        {/* ── 6. Bottone Force OTA Check ── */}
        <TouchableOpacity
          style={[styles.actionBtnWide, isManualOtaRunning && { opacity: 0.6 }]}
          onPress={handleManualOtaCheck}
          disabled={isManualOtaRunning}
          testID="force-ota-check-btn"
        >
          {isManualOtaRunning ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="cloud-download-outline" size={16} color="#fff" />
              <Text style={styles.actionBtnText}>Forza controllo OTA</Text>
            </>
          )}
        </TouchableOpacity>
        <Text style={styles.hintText}>
          Bypassa il cooldown e contatta /api/expo-updates. L&apos;esito viene loggato in DB
          e mostrato sotto.
        </Text>

        <View style={styles.filterRow}>
          <TextInput
            style={styles.filterInput}
            placeholder="Phase…"
            placeholderTextColor={Colors.textMuted ?? "#888"}
            value={otaFilterPhase}
            onChangeText={setOtaFilterPhase}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={styles.filterInput}
            placeholder="Source…"
            placeholderTextColor={Colors.textMuted ?? "#888"}
            value={otaFilterSource}
            onChangeText={setOtaFilterSource}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        <View style={styles.filterRow}>
          <TextInput
            style={styles.filterInput}
            placeholder="Platform…"
            placeholderTextColor={Colors.textMuted ?? "#888"}
            value={otaFilterPlatform}
            onChangeText={setOtaFilterPlatform}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={styles.filterInput}
            placeholder="Update ID…"
            placeholderTextColor={Colors.textMuted ?? "#888"}
            value={otaFilterUpdateId}
            onChangeText={setOtaFilterUpdateId}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        {(otaFilterPhase || otaFilterSource || otaFilterPlatform || otaFilterUpdateId) && (
          <TouchableOpacity
            onPress={() => {
              setOtaFilterPhase("");
              setOtaFilterSource("");
              setOtaFilterPlatform("");
              setOtaFilterUpdateId("");
            }}
            style={[
              styles.actionBtnWide,
              { marginTop: 4, marginBottom: 8, backgroundColor: "#555" },
            ]}
          >
            <Ionicons name="close-circle-outline" size={14} color="#fff" />
            <Text style={styles.actionBtnText}>Rimuovi filtri</Text>
          </TouchableOpacity>
        )}

        {(otaEventsData?.events ?? []).length === 0 ? (
          <Text style={[styles.hintText, { marginTop: 12 }]}>
            Nessun evento OTA registrato.
          </Text>
        ) : (
          (otaEventsData?.events ?? []).slice(0, 100).map((e) => {
            const isErr = !!e.error && !e.error.startsWith("ok:");
            const color = isErr ? "#FF4444" : "#44AA44";
            const icon: keyof typeof Ionicons.glyphMap = isErr
              ? "alert-circle-outline"
              : "checkmark-circle-outline";
            return (
              <View key={e.id} style={styles.row}>
                <Ionicons name={icon} size={14} color={color} />
                <View style={{ flex: 1, marginLeft: 6 }}>
                  <Text style={[styles.rowReason, { fontSize: 11 }]} numberOfLines={2}>
                    {e.phase}
                    {e.source ? ` · ${e.source}` : ""}
                    {e.platform ? ` · ${e.platform}` : ""}
                    {e.error ? ` — ${e.error}` : ""}
                  </Text>
                  <Text style={styles.rowTime}>
                    rv={e.runtime_version ?? "?"} · uid=
                    {(e.current_update_id ?? "?").substring(0, 12)}
                    {e.release_id ? ` · rel=${e.release_id.substring(0, 8)}` : ""}
                    {e.fail_count > 0 ? ` · fail#${e.fail_count}` : ""} ·{" "}
                    {formatTimestamp(e.created_at)}
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </View>

      {/* ── 5. Errori OTA checker ── */}
      {otaErrors.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="warning-outline" size={18} color="#FF4444" />
            <Text style={[styles.cardTitle, { color: "#FF4444" }]}>Errori OTA checker</Text>
            <View style={[styles.badge, { backgroundColor: "#FF4444" }]}>
              <Text style={styles.badgeText}>{otaErrors.length}</Text>
            </View>
          </View>
          {otaErrors.slice(0, 10).map((e, i) => (
            <View key={i} style={styles.row}>
              <Ionicons name="alert-circle-outline" size={14} color="#FF4444" />
              <View style={{ flex: 1, marginLeft: 6 }}>
                <Text
                  style={[styles.rowReason, { color: "#FF8888", fontSize: 11 }]}
                  numberOfLines={2}
                >
                  {e.error}
                </Text>
                <Text style={styles.rowTime}>
                  rv={e.runtimeVersion} · fail#{e.failCount} · {formatTimestamp(e.timestamp)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function OtaAdoptionCard({ stats }: { stats: OtaStatRow[] }) {
  const groups = useMemo(() => {
    const map = new Map<
      string,
      { updateId: string; rv: string; lastSeen: string; rows: OtaStatRow[] }
    >();
    for (const row of stats) {
      const key = `${row.current_update_id}|${row.runtime_version}`;
      if (!map.has(key)) {
        map.set(key, {
          updateId: row.current_update_id,
          rv: row.runtime_version,
          lastSeen: row.last_seen,
          rows: [],
        });
      }
      const g = map.get(key)!;
      g.rows.push(row);
      if (new Date(row.last_seen) > new Date(g.lastSeen)) g.lastSeen = row.last_seen;
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime(),
    );
  }, [stats]);

  const updateIdToOtaNum = useMemo(() => {
    const m = new Map<string, number>();
    for (const entry of otaUpdates as OtaUpdate[]) {
      if (entry.androidUpdateId) m.set(entry.androidUpdateId, entry.updateNumber);
      if (entry.iosUpdateId) m.set(entry.iosUpdateId, entry.updateNumber);
    }
    return m;
  }, []);

  if (groups.length === 0) {
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="trending-up-outline" size={18} color={Colors.accent} />
          <Text style={styles.cardTitle}>Adozione OTA</Text>
        </View>
        <Text style={styles.hintText}>Nessun dato di adozione disponibile.</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Ionicons name="trending-up-outline" size={18} color={Colors.accent} />
        <Text style={styles.cardTitle}>Adozione OTA</Text>
        <View style={[styles.badge, { backgroundColor: Colors.accent }]}>
          <Text style={styles.badgeText}>{groups.length}</Text>
        </View>
      </View>
      <Text style={styles.hintText}>
        Dispositivi raggruppati per versione OTA installata · aggiornato ogni 30s
      </Text>
      {groups.slice(0, 10).map((g) => {
        const otaNum = updateIdToOtaNum.get(g.updateId);
        const label =
          otaNum != null
            ? `OTA-${otaNum}`
            : g.updateId
              ? g.updateId.substring(0, 10) + "…"
              : "sconosciuto";
        const totalErr = g.rows.reduce((s, r) => s + Number(r.error_count), 0);
        const totalDev = g.rows.reduce((s, r) => s + Number(r.unique_devices), 0);
        return (
          <View key={`${g.updateId}|${g.rv}`} style={{ marginTop: 10 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                marginBottom: 4,
              }}
            >
              <View
                style={[styles.badge, { backgroundColor: totalErr > 0 ? "#AA4400" : "#1a5c2e" }]}
              >
                <Text style={styles.badgeText}>{label}</Text>
              </View>
              <Text
                style={[styles.hintText, { marginTop: 0, fontStyle: "normal", flex: 1 }]}
              >
                rv {g.rv} · {formatTimestamp(g.lastSeen)}
              </Text>
              <Text style={{ color: Colors.textMuted ?? "#888", fontSize: 10 }}>
                {totalDev} dev
              </Text>
            </View>
            {g.rows.map((r) => (
              <View key={r.platform} style={[styles.row, { paddingLeft: 8 }]}>
                <Ionicons
                  name={
                    r.platform === "android"
                      ? "logo-android"
                      : r.platform === "ios"
                        ? "logo-apple"
                        : "phone-portrait-outline"
                  }
                  size={13}
                  color={Colors.textMuted ?? "#888"}
                />
                <Text
                  style={[styles.rowReason, { flex: 1, color: Colors.textMuted ?? "#888" }]}
                >
                  {r.platform}
                </Text>
                <Text
                  style={{
                    color: "#44AA44",
                    fontFamily: "Inter_600SemiBold",
                    fontSize: 12,
                    marginRight: 10,
                  }}
                >
                  {Number(r.ok_count)} ✓
                </Text>
                <Text
                  style={{
                    color:
                      Number(r.error_count) > 0 ? "#FF4444" : Colors.textMuted ?? "#888",
                    fontFamily: "Inter_600SemiBold",
                    fontSize: 12,
                  }}
                >
                  {Number(r.error_count)} ✗
                </Text>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

function OtaDiagnosticsCard({ events }: { events: OtaEventRow[] }) {
  const [stackOpen, setStackOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const lastErrorEvent = useMemo(() => {
    const withDiag = events.find(
      (e) =>
        !!e.diagnostics &&
        e.phase !== "server-check" &&
        e.phase !== "server-anon-check",
    );
    if (withDiag) return withDiag;
    return (
      events.find(
        (e) =>
          !!e.error &&
          !e.error.startsWith("ok:") &&
          e.phase !== "server-check" &&
          e.phase !== "server-anon-check",
      ) ?? null
    );
  }, [events]);

  const handleCopy = useCallback(async () => {
    if (!lastErrorEvent) return;
    try {
      await Clipboard.setStringAsync(JSON.stringify(lastErrorEvent, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      Alert.alert("Errore", "Impossibile copiare negli appunti.");
    }
  }, [lastErrorEvent]);

  if (!lastErrorEvent) {
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="bug-outline" size={18} color={Colors.accent} />
          <Text style={styles.cardTitle}>Diagnostica OTA</Text>
        </View>
        <Text style={styles.hintText}>
          Nessun errore OTA recente. Quando il check fallisce, qui appariranno codice
          errore, stato di rete, esito del probe HTTP e stack nativo.
        </Text>
      </View>
    );
  }

  const diag = lastErrorEvent.diagnostics ?? {};
  const probe = diag.probe;
  const probeOk =
    probe && typeof probe.status === "number" && probe.status >= 200 && probe.status < 400;
  const probeColor = probe?.error ? "#FF4444" : probeOk ? "#44AA44" : "#FF8C00";

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Ionicons name="bug-outline" size={18} color="#FF4444" />
        <Text style={[styles.cardTitle, { color: "#FF4444" }]}>Diagnostica OTA</Text>
        <TouchableOpacity
          onPress={handleCopy}
          style={{ marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 4 }}
        >
          <Ionicons
            name={copied ? "checkmark-outline" : "copy-outline"}
            size={16}
            color={copied ? "#44AA44" : Colors.accent}
          />
          <Text style={{ color: copied ? "#44AA44" : Colors.accent, fontSize: 12 }}>
            {copied ? "Copiato" : "Copia"}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.hintText, { fontSize: 11, marginBottom: 8 }]}>
        Ultimo errore: {formatTimestamp(lastErrorEvent.created_at)}
      </Text>

      {diag.errorCode ? (
        <View style={diagStyles.row}>
          <Text style={diagStyles.label}>code</Text>
          <Text style={[diagStyles.value, { color: "#FF4444", fontWeight: "700" }]}>
            {diag.errorCode}
          </Text>
        </View>
      ) : null}

      <View style={diagStyles.row}>
        <Text style={diagStyles.label}>error</Text>
        <Text style={diagStyles.value} numberOfLines={3}>
          {lastErrorEvent.error}
        </Text>
      </View>

      {diag.errorCause ? (
        <View style={diagStyles.row}>
          <Text style={diagStyles.label}>cause</Text>
          <Text style={diagStyles.value} numberOfLines={3}>
            {diag.errorCause}
          </Text>
        </View>
      ) : null}

      {diag.errorUserInfo ? (
        <View style={diagStyles.row}>
          <Text style={diagStyles.label}>userInfo</Text>
          <Text style={diagStyles.value} numberOfLines={3}>
            {diag.errorUserInfo}
          </Text>
        </View>
      ) : null}

      {diag.channel ? (
        <View style={diagStyles.row}>
          <Text style={diagStyles.label}>channel</Text>
          <Text style={diagStyles.value}>{diag.channel}</Text>
        </View>
      ) : null}

      {diag.networkInfo ? (
        <View style={diagStyles.row}>
          <Text style={diagStyles.label}>network</Text>
          <Text style={diagStyles.value}>{diag.networkInfo}</Text>
        </View>
      ) : null}

      {diag.updateUrl ? (
        <View style={diagStyles.row}>
          <Text style={diagStyles.label}>updateUrl</Text>
          <Text style={diagStyles.value} numberOfLines={2}>
            {diag.updateUrl}
          </Text>
        </View>
      ) : null}

      {probe ? (
        <View style={diagStyles.probeBox}>
          <View
            style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}
          >
            <Ionicons
              name={probe.error ? "close-circle" : probeOk ? "checkmark-circle" : "alert-circle"}
              size={14}
              color={probeColor}
            />
            <Text style={{ color: probeColor, fontWeight: "700", fontSize: 12 }}>
              probe HTTP {probe.status ?? "—"}
              {typeof probe.durationMs === "number" ? ` · ${probe.durationMs}ms` : ""}
            </Text>
          </View>
          {probe.contentType ? (
            <Text style={diagStyles.probeMeta}>content-type: {probe.contentType}</Text>
          ) : null}
          {probe.error ? (
            <Text style={[diagStyles.probeMeta, { color: "#FF8888" }]}>
              err: {probe.error}
            </Text>
          ) : null}
          {probe.bodySnippet ? (
            <Text style={diagStyles.probeBody} numberOfLines={3}>
              {probe.bodySnippet || "(empty body)"}
            </Text>
          ) : null}
        </View>
      ) : null}

      {diag.nativeStack ? (
        <View style={{ marginTop: 8 }}>
          <TouchableOpacity
            onPress={() => setStackOpen((v) => !v)}
            style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
          >
            <Ionicons
              name={stackOpen ? "chevron-down-outline" : "chevron-forward-outline"}
              size={14}
              color={Colors.textMuted ?? "#666"}
            />
            <Text style={{ color: Colors.textMuted ?? "#666", fontSize: 12 }}>
              nativeStack ({diag.nativeStack.length}c)
            </Text>
          </TouchableOpacity>
          {stackOpen ? (
            <Text style={diagStyles.stack} selectable>
              {diag.nativeStack}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const diagStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    paddingVertical: 3,
    gap: 8,
    alignItems: "flex-start",
  },
  label: {
    color: Colors.textMuted ?? "#666",
    fontSize: 11,
    width: 80,
    fontVariant: ["tabular-nums"],
  },
  value: {
    color: Colors.text,
    fontSize: 12,
    flex: 1,
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "monospace",
    }),
  },
  probeBox: {
    marginTop: 8,
    padding: 8,
    borderRadius: 6,
    backgroundColor: "rgba(0,0,0,0.2)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  probeMeta: {
    color: Colors.textMuted ?? "#666",
    fontSize: 11,
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "monospace",
    }),
  },
  probeBody: {
    color: Colors.text,
    fontSize: 11,
    marginTop: 4,
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "monospace",
    }),
  },
  stack: {
    marginTop: 6,
    color: Colors.text,
    fontSize: 10,
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "monospace",
    }),
    backgroundColor: "rgba(0,0,0,0.3)",
    padding: 6,
    borderRadius: 4,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: 16,
  },
  summary: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  releaseCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 12,
  },
  releaseHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  releaseHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
  },
  releaseHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  rvBadge: {
    backgroundColor: Colors.textSecondary + "22",
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  rvText: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: Colors.textSecondary,
    letterSpacing: 0.2,
  },
  adoptionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.accent + "18",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  adoptionText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: Colors.accent,
  },
  otaNumber: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: Colors.background,
  },
  statusText: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  releaseMessage: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.text,
    marginBottom: 6,
    lineHeight: 20,
  },
  releaseMeta: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 4,
  },
  releaseMetaText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  releaseNote: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 17,
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 6,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  cardTitle: {
    color: Colors.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    flex: 1,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 0.5,
  },
  hintText: {
    color: Colors.textMuted ?? "#888",
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    fontStyle: "italic",
    marginTop: 8,
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 5,
    borderTopWidth: 1,
    borderTopColor: Colors.border ?? "#333",
  },
  rowReason: {
    color: Colors.text,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    flex: 1,
  },
  rowTime: {
    color: Colors.textMuted ?? "#888",
    fontFamily: "Inter_400Regular",
    fontSize: 11,
  },
  actionBtnWide: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#444",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 8,
  },
  actionBtnText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  filterRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 8,
  },
  filterInput: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: Colors.text,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    borderWidth: 1,
    borderColor: Colors.border ?? "#333",
  },
});
