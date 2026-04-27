import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  TextInput,
  Alert,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useNavigation } from "expo-router";
import Constants from "expo-constants";
import otaUpdatesRaw from "@/ota-updates.json";
import { getApiUrl } from "@/lib/query-client";
import { evaluateUpdateOutcome, type UpdateOutcome } from "@/lib/semver";
import {
  triggerSoftPreview,
  triggerForcedPreview,
  forceRecheck,
} from "@/components/NativeUpdateChecker";

interface OtaUpdateEntry {
  updateNumber: number;
  channel: string;
  message: string;
  publishedAt?: string;
  runtimeVersion: string;
  platforms: string[];
  jsEngine: string;
  note?: string;
  updateGroupId: string;
  androidUpdateId: string | null;
  iosUpdateId: string | null;
  commitBase: string;
  easDashboard: string;
  status: string;
}

const otaUpdates: OtaUpdateEntry[] = otaUpdatesRaw as OtaUpdateEntry[];

interface SystemEvent {
  timestamp: string;
  message: string;
  type: string;
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
  events: SystemEvent[];
  otaErrors?: OtaErrorEntry[];
}

interface ServerRestart {
  id: string;
  startedAt: string;
  reason: string;
}

interface RestartHistory {
  total: number;
  restarts: ServerRestart[];
}

function formatDuration(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

const ROME_TZ = "Europe/Rome";

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", timeZone: ROME_TZ });
    const time = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: ROME_TZ });
    return `${date} ${time}`;
  } catch {
    return iso;
  }
}

function eventIcon(type: string): { name: keyof typeof Ionicons.glyphMap; color: string } {
  switch (type) {
    case "BACKEND_RESTART":
      return { name: "refresh-circle", color: "#FF4444" };
    case "COLD_START":
      return { name: "power", color: "#44AA44" };
    case "METRO_UP":
      return { name: "wifi", color: "#44AA44" };
    case "METRO_DOWN":
      return { name: "wifi-outline", color: "#FF4444" };
    /* legacy frontend events — kept for historical log display */
    case "OTA_PUBLISHED":
      return { name: "cloud-download-outline", color: Colors.accent };
    default:
      return { name: "ellipse-outline", color: "#888888" };
  }
}

function eventLabel(type: string): string {
  switch (type) {
    case "BACKEND_RESTART": return "Riavvio Backend";
    case "COLD_START": return "Avvio Freddo";
    case "METRO_UP": return "Frontend Online";
    case "METRO_DOWN": return "Frontend Offline";
    case "OTA_PUBLISHED": return "Aggiornamento OTA";
    default: return "Evento generico";
  }
}

interface NativeVersionConfig {
  android: { latestVersion: string; minVersion: string; storeUrl: string };
  ios: { latestVersion: string; minVersion: string; storeUrl: string };
}

interface VersionDistributionRow {
  platform: string;
  version: string;
  count: number;
}

interface VersionDistribution {
  totalTracked: number;
  underMin: number;
  underLatest: number;
  config: {
    android: { latestVersion: string; minVersion: string };
    ios: { latestVersion: string; minVersion: string };
  };
  byPlatformVersion: VersionDistributionRow[];
  windowDays: number;
  generatedAt: string;
}

function platformLabel(p: string): string {
  if (p === "android") return "Android";
  if (p === "ios") return "iOS";
  if (p === "web") return "Web";
  return p;
}

function outcomeMeta(o: UpdateOutcome): { label: string; color: string; icon: keyof typeof Ionicons.glyphMap } {
  if (o === "force") return { label: "Force update richiesto", color: "#FF4444", icon: "alert-circle" };
  if (o === "soft") return { label: "Soft update disponibile", color: "#FFAA00", icon: "arrow-up-circle" };
  return { label: "Nessun aggiornamento", color: "#44AA44", icon: "checkmark-circle" };
}

export default function SystemScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [backendUptimeSec, setBackendUptimeSec] = useState<number>(0);

  const [nativeAndroidLatest, setNativeAndroidLatest] = useState("");
  const [nativeAndroidMin, setNativeAndroidMin] = useState("");
  const [nativeAndroidUrl, setNativeAndroidUrl] = useState("");
  const [nativeIosLatest, setNativeIosLatest] = useState("");
  const [nativeIosMin, setNativeIosMin] = useState("");
  const [nativeIosUrl, setNativeIosUrl] = useState("");
  const [savingNative, setSavingNative] = useState(false);

  const { data: nativeVerData, refetch: refetchNativeVer, isFetching: isFetchingNativeVer } = useQuery<NativeVersionConfig>({
    queryKey: ["/api/settings/native-version"],
  });

  const {
    data: versionDist,
    isLoading: isLoadingDist,
    isFetching: isFetchingDist,
    refetch: refetchDist,
  } = useQuery<VersionDistribution>({
    queryKey: ["/api/admin/settings/version-distribution"],
    refetchInterval: 60000,
  });

  const installedVersion = Constants.expoConfig?.version ?? "0.0.0";
  const installedPlatform: "android" | "ios" | "web" = Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web";

  const checkOutcome: UpdateOutcome | null = useMemo(() => {
    if (!nativeVerData || installedPlatform === "web") return null;
    const cfg = installedPlatform === "android" ? nativeVerData.android : nativeVerData.ios;
    return evaluateUpdateOutcome(installedVersion, cfg.minVersion, cfg.latestVersion);
  }, [nativeVerData, installedPlatform, installedVersion]);

  const [isCleanupRunning, setIsCleanupRunning] = useState(false);

  const handleCacheCleanup = useCallback(async () => {
    setIsCleanupRunning(true);
    try {
      const res = await fetch(
        new URL("/api/admin/cache/cleanup", getApiUrl()).toString(),
        { method: "POST", credentials: "include" }
      );
      if (res.status === 409) {
        Alert.alert("In corso", "Pulizia cache già in esecuzione, attendi.");
        return;
      }
      if (!res.ok) throw new Error("Errore server");
      Alert.alert("Avviata", "Pulizia cache workspace avviata in background.");
    } catch {
      Alert.alert("Errore", "Impossibile avviare la pulizia della cache.");
    } finally {
      setIsCleanupRunning(false);
    }
  }, []);

  const [isRechecking, setIsRechecking] = useState(false);
  const handleForceRecheck = useCallback(async () => {
    setIsRechecking(true);
    try {
      await Promise.all([refetchNativeVer(), forceRecheck()]);
    } finally {
      setIsRechecking(false);
    }
  }, [refetchNativeVer]);

  useEffect(() => {
    if (!nativeVerData) return;
    setNativeAndroidLatest(nativeVerData.android.latestVersion);
    setNativeAndroidMin(nativeVerData.android.minVersion);
    setNativeAndroidUrl(nativeVerData.android.storeUrl);
    setNativeIosLatest(nativeVerData.ios.latestVersion);
    setNativeIosMin(nativeVerData.ios.minVersion);
    setNativeIosUrl(nativeVerData.ios.storeUrl);
  }, [nativeVerData]);

  const saveNativeVersion = useCallback(async () => {
    setSavingNative(true);
    try {
      const res = await fetch(
        new URL("/api/admin/settings/native-version", getApiUrl()).toString(),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            android: { latestVersion: nativeAndroidLatest, minVersion: nativeAndroidMin, storeUrl: nativeAndroidUrl },
            ios: { latestVersion: nativeIosLatest, minVersion: nativeIosMin, storeUrl: nativeIosUrl },
          }),
        }
      );
      if (!res.ok) throw new Error("Errore server");
      Alert.alert("Salvato", "Configurazione versioni native aggiornata.");
    } catch {
      Alert.alert("Errore", "Impossibile salvare la configurazione.");
    } finally {
      setSavingNative(false);
    }
  }, [nativeAndroidLatest, nativeAndroidMin, nativeAndroidUrl, nativeIosLatest, nativeIosMin, nativeIosUrl]);

  const { data, isLoading, isError, refetch, isFetching } = useQuery<SystemHealth>({
    queryKey: ["/api/admin/system-health"],
    refetchInterval: 30000,
  });

  const { data: restartHistory } = useQuery<RestartHistory>({
    queryKey: ["/api/admin/restart-history"],
    refetchInterval: 60000,
  });

  const mergedEvents = useMemo<SystemEvent[]>(() => {
    const backendEvents: SystemEvent[] = data?.events ?? [];
    const otaEvents: SystemEvent[] = otaUpdates
      .filter((entry) => !!entry.publishedAt)
      .map((entry) => ({
        timestamp: new Date(entry.publishedAt).toISOString(),
        message: `OTA-${entry.updateNumber}: ${entry.message}`,
        type: "OTA_PUBLISHED",
      }));
    return [...backendEvents, ...otaEvents].sort((a, b) => {
      const ta = new Date(a.timestamp).getTime();
      const tb = new Date(b.timestamp).getTime();
      if (isNaN(ta) && isNaN(tb)) return 0;
      if (isNaN(ta)) return 1;
      if (isNaN(tb)) return -1;
      return tb - ta;
    });
  }, [data?.events]);

  useEffect(() => {
    if (data) {
      setBackendUptimeSec(data.backendUptimeSec);
    }
  }, [data]);

  useEffect(() => {
    const interval = setInterval(() => {
      setBackendUptimeSec((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={handleRefresh} style={{ marginRight: 16 }}>
          {isFetching ? (
            <ActivityIndicator size="small" color={Colors.accent} />
          ) : (
            <Ionicons name="refresh" size={22} color={Colors.accent} />
          )}
        </TouchableOpacity>
      ),
    });
  }, [navigation, handleRefresh, isFetching]);

  const topPadding = Platform.OS === "web" ? 67 : 0;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  if (isLoading) {
    return (
      <View style={[styles.center, { paddingTop: topPadding }]}>
        <ActivityIndicator size="large" color={Colors.accent} />
        <Text style={styles.loadingText}>Caricamento sistema…</Text>
      </View>
    );
  }

  if (isError || !data) {
    return (
      <View style={[styles.center, { paddingTop: topPadding }]}>
        <Ionicons name="warning-outline" size={40} color="#FF4444" />
        <Text style={styles.errorText}>Errore nel caricamento dei dati</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={handleRefresh}>
          <Text style={styles.retryBtnText}>Riprova</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <FlatList
      data={mergedEvents}
      keyExtractor={(item, index) => `${item.timestamp}-${index}`}
      contentContainerStyle={[
        styles.listContent,
        { paddingTop: topPadding + 16, paddingBottom: bottomPadding + 16 },
      ]}
      ListHeaderComponent={
        <>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="server-outline" size={18} color={Colors.accent} />
              <Text style={styles.cardTitle}>Backend</Text>
              <View style={[styles.badge, { backgroundColor: "#44AA44" }]}>
                <Text style={styles.badgeText}>ONLINE</Text>
              </View>
            </View>
            <Text style={styles.uptimeTimer}>{formatDuration(backendUptimeSec)}</Text>
            <Text style={styles.startedAt}>
              Avviato: {formatTimestamp(new Date(data.backendStartedAt).toISOString())}
            </Text>
          </View>

          {restartHistory && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="refresh-circle-outline" size={18} color={Colors.accent} />
                <Text style={styles.cardTitle}>Storico Riavvii</Text>
                <View style={[styles.badge, { backgroundColor: Colors.accent }]}>
                  <Text style={styles.badgeText}>{restartHistory.total}</Text>
                </View>
              </View>
              {restartHistory.restarts.slice(0, 10).map((r) => (
                <View key={r.id} style={styles.restartRow}>
                  <Ionicons
                    name={r.reason === "cold_start" ? "power-outline" : "refresh-outline"}
                    size={14}
                    color={r.reason === "cold_start" ? "#44AA44" : "#FF8C00"}
                  />
                  <Text style={styles.restartReason}>
                    {r.reason === "cold_start" ? "Avvio freddo" : "Riavvio"}
                  </Text>
                  <Text style={styles.restartTime}>
                    {formatTimestamp(r.startedAt)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {(data.otaErrors ?? []).length > 0 && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="warning-outline" size={18} color="#FF4444" />
                <Text style={[styles.cardTitle, { color: "#FF4444" }]}>Errori OTA checker</Text>
                <View style={[styles.badge, { backgroundColor: "#FF4444" }]}>
                  <Text style={styles.badgeText}>{(data.otaErrors ?? []).length}</Text>
                </View>
              </View>
              {(data.otaErrors ?? []).slice(0, 10).map((e, i) => (
                <View key={i} style={styles.restartRow}>
                  <Ionicons name="alert-circle-outline" size={14} color="#FF4444" />
                  <View style={{ flex: 1, marginLeft: 6 }}>
                    <Text style={[styles.restartReason, { color: "#FF8888", fontSize: 11 }]} numberOfLines={2}>
                      {e.error}
                    </Text>
                    <Text style={styles.restartTime}>
                      rv={e.runtimeVersion} · fail#{e.failCount} · {formatTimestamp(e.timestamp)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="cloud-download-outline" size={18} color={Colors.accent} />
              <Text style={styles.cardTitle}>Storico OTA</Text>
              <View style={[styles.badge, { backgroundColor: Colors.accent }]}>
                <Text style={styles.badgeText}>{otaUpdates.length}</Text>
              </View>
            </View>
            {otaUpdates.slice().reverse().slice(0, 8).map((u) => (
              <View key={u.updateNumber} style={styles.restartRow}>
                <Ionicons
                  name={u.status === "published" ? "checkmark-circle-outline" : "ellipse-outline"}
                  size={14}
                  color={u.status === "published" ? Colors.accent : Colors.textMuted ?? "#888"}
                />
                <Text style={styles.restartReason} numberOfLines={1}>
                  OTA-{u.updateNumber}: {u.message}
                </Text>
                <Text style={styles.restartTime}>
                  {u.publishedAt ? new Date(u.publishedAt).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" }) : "—"}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="phone-portrait-outline" size={18} color={Colors.accent} />
              <Text style={styles.cardTitle}>Versioni Native</Text>
            </View>
            <Text style={styles.nativeLabel}>Android</Text>
            <View style={styles.nativeRow}>
              <View style={styles.nativeField}>
                <Text style={styles.nativeFieldLabel}>Ultima</Text>
                <TextInput
                  style={styles.nativeInput}
                  value={nativeAndroidLatest}
                  onChangeText={setNativeAndroidLatest}
                  placeholder="2.2.0"
                  placeholderTextColor={Colors.textMuted ?? "#666"}
                  autoCorrect={false}
                  autoCapitalize="none"
                />
              </View>
              <View style={styles.nativeField}>
                <Text style={styles.nativeFieldLabel}>Minima</Text>
                <TextInput
                  style={styles.nativeInput}
                  value={nativeAndroidMin}
                  onChangeText={setNativeAndroidMin}
                  placeholder="1.0.0"
                  placeholderTextColor={Colors.textMuted ?? "#666"}
                  autoCorrect={false}
                  autoCapitalize="none"
                />
              </View>
            </View>
            <TextInput
              style={[styles.nativeInput, { marginBottom: 12 }]}
              value={nativeAndroidUrl}
              onChangeText={setNativeAndroidUrl}
              placeholder="URL Play Store"
              placeholderTextColor={Colors.textMuted ?? "#666"}
              autoCorrect={false}
              autoCapitalize="none"
            />
            <Text style={styles.nativeLabel}>iOS</Text>
            <View style={styles.nativeRow}>
              <View style={styles.nativeField}>
                <Text style={styles.nativeFieldLabel}>Ultima</Text>
                <TextInput
                  style={styles.nativeInput}
                  value={nativeIosLatest}
                  onChangeText={setNativeIosLatest}
                  placeholder="2.2.0"
                  placeholderTextColor={Colors.textMuted ?? "#666"}
                  autoCorrect={false}
                  autoCapitalize="none"
                />
              </View>
              <View style={styles.nativeField}>
                <Text style={styles.nativeFieldLabel}>Minima</Text>
                <TextInput
                  style={styles.nativeInput}
                  value={nativeIosMin}
                  onChangeText={setNativeIosMin}
                  placeholder="1.0.0"
                  placeholderTextColor={Colors.textMuted ?? "#666"}
                  autoCorrect={false}
                  autoCapitalize="none"
                />
              </View>
            </View>
            <TextInput
              style={[styles.nativeInput, { marginBottom: 16 }]}
              value={nativeIosUrl}
              onChangeText={setNativeIosUrl}
              placeholder="URL App Store"
              placeholderTextColor={Colors.textMuted ?? "#666"}
              autoCorrect={false}
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={[styles.nativeSaveBtn, savingNative && { opacity: 0.6 }]}
              onPress={saveNativeVersion}
              disabled={savingNative}
            >
              {savingNative ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.nativeSaveBtnText}>Salva configurazione</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="shield-checkmark-outline" size={18} color={Colors.accent} />
              <Text style={styles.cardTitle}>Verifica aggiornamenti versione</Text>
              <TouchableOpacity onPress={handleForceRecheck} disabled={isRechecking || isFetchingNativeVer}>
                {(isRechecking || isFetchingNativeVer) ? (
                  <ActivityIndicator size="small" color={Colors.accent} />
                ) : (
                  <Ionicons name="refresh" size={18} color={Colors.accent} />
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>Versione installata</Text>
              <Text style={styles.kvValue}>{installedVersion} · {platformLabel(installedPlatform)}</Text>
            </View>

            {nativeVerData && (
              <>
                <View style={styles.kvRow}>
                  <Text style={styles.kvLabel}>Backend Android</Text>
                  <Text style={styles.kvValue}>
                    latest {nativeVerData.android.latestVersion} · min {nativeVerData.android.minVersion}
                  </Text>
                </View>
                <View style={styles.kvRow}>
                  <Text style={styles.kvLabel}>Store URL Android</Text>
                  <Text style={styles.kvValue} numberOfLines={1}>{nativeVerData.android.storeUrl}</Text>
                </View>
                <View style={styles.kvRow}>
                  <Text style={styles.kvLabel}>Backend iOS</Text>
                  <Text style={styles.kvValue}>
                    latest {nativeVerData.ios.latestVersion} · min {nativeVerData.ios.minVersion}
                  </Text>
                </View>
                <View style={styles.kvRow}>
                  <Text style={styles.kvLabel}>Store URL iOS</Text>
                  <Text style={styles.kvValue} numberOfLines={1}>{nativeVerData.ios.storeUrl}</Text>
                </View>
              </>
            )}

            {installedPlatform === "web" ? (
              <View style={[styles.outcomeRow, { backgroundColor: "rgba(136,136,136,0.15)" }]}>
                <Ionicons name="information-circle" size={18} color={Colors.textMuted ?? "#888"} />
                <Text style={[styles.outcomeText, { color: Colors.textMuted ?? "#888" }]}>
                  Il check di versione gira solo su Android/iOS.
                </Text>
              </View>
            ) : checkOutcome ? (
              (() => {
                const meta = outcomeMeta(checkOutcome);
                return (
                  <View style={[styles.outcomeRow, { backgroundColor: `${meta.color}22` }]}>
                    <Ionicons name={meta.icon} size={18} color={meta.color} />
                    <Text style={[styles.outcomeText, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                );
              })()
            ) : (
              <View style={[styles.outcomeRow, { backgroundColor: "rgba(136,136,136,0.15)" }]}>
                <ActivityIndicator size="small" color={Colors.textMuted ?? "#888"} />
                <Text style={[styles.outcomeText, { color: Colors.textMuted ?? "#888" }]}>
                  Caricamento configurazione…
                </Text>
              </View>
            )}

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.actionBtn, installedPlatform === "web" && styles.actionBtnDisabled]}
                onPress={() => triggerSoftPreview()}
                disabled={installedPlatform === "web"}
              >
                <Ionicons name="arrow-up-circle-outline" size={16} color="#fff" />
                <Text style={styles.actionBtnText}>Simula popup soft</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: "#FF4444" }, installedPlatform === "web" && styles.actionBtnDisabled]}
                onPress={() => triggerForcedPreview()}
                disabled={installedPlatform === "web"}
              >
                <Ionicons name="alert-circle-outline" size={16} color="#fff" />
                <Text style={styles.actionBtnText}>Simula popup forzato</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.actionBtnWide, isRechecking && { opacity: 0.6 }]}
              onPress={handleForceRecheck}
              disabled={isRechecking}
            >
              {isRechecking ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="refresh-circle-outline" size={16} color="#fff" />
                  <Text style={styles.actionBtnText}>Forza re-check ora</Text>
                </>
              )}
            </TouchableOpacity>
            {installedPlatform === "web" && (
              <Text style={styles.hintText}>
                I pulsanti di simulazione sono disabilitati su web (il modale di update gira solo su mobile).
              </Text>
            )}
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="people-outline" size={18} color={Colors.accent} />
              <Text style={styles.cardTitle}>Distribuzione versioni utenti</Text>
              <TouchableOpacity onPress={() => refetchDist()} disabled={isFetchingDist}>
                {isFetchingDist ? (
                  <ActivityIndicator size="small" color={Colors.accent} />
                ) : (
                  <Ionicons name="refresh" size={18} color={Colors.accent} />
                )}
              </TouchableOpacity>
            </View>

            {isLoadingDist ? (
              <View style={{ alignItems: "center", paddingVertical: 16 }}>
                <ActivityIndicator size="small" color={Colors.accent} />
              </View>
            ) : !versionDist ? (
              <Text style={styles.hintText}>Dati non disponibili.</Text>
            ) : (
              <>
                <View style={styles.statsRow}>
                  <View style={styles.statBox}>
                    <Text style={styles.statValue}>{versionDist.totalTracked}</Text>
                    <Text style={styles.statLabel}>Tracciati ({versionDist.windowDays}gg)</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={[styles.statValue, { color: "#FF4444" }]}>{versionDist.underMin}</Text>
                    <Text style={styles.statLabel}>{"< minVersion"}</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={[styles.statValue, { color: "#FFAA00" }]}>{versionDist.underLatest}</Text>
                    <Text style={styles.statLabel}>{"< latestVersion"}</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={[styles.statValue, { color: "#44AA44" }]}>
                      {versionDist.totalTracked > 0
                        ? Math.round(((versionDist.totalTracked - versionDist.underMin - versionDist.underLatest) / versionDist.totalTracked) * 100)
                        : 0}%
                    </Text>
                    <Text style={styles.statLabel}>Aggiornati</Text>
                  </View>
                </View>

                {versionDist.byPlatformVersion.length === 0 ? (
                  <Text style={styles.hintText}>Nessun heartbeat con versione negli ultimi {versionDist.windowDays} giorni.</Text>
                ) : (
                  ["android", "ios", "web"].map((plat) => {
                    const rows = versionDist.byPlatformVersion.filter((r) => r.platform === plat);
                    if (rows.length === 0) return null;
                    const cfg = plat === "android" ? versionDist.config.android : plat === "ios" ? versionDist.config.ios : null;
                    return (
                      <View key={plat} style={{ marginTop: 10 }}>
                        <Text style={styles.nativeLabel}>{platformLabel(plat)}</Text>
                        {rows.map((row) => {
                          let badge: { color: string; text: string } | null = null;
                          if (cfg) {
                            const o = evaluateUpdateOutcome(row.version, cfg.minVersion, cfg.latestVersion);
                            if (o === "force") badge = { color: "#FF4444", text: "< min" };
                            else if (o === "soft") badge = { color: "#FFAA00", text: "< latest" };
                          }
                          return (
                            <View key={`${plat}-${row.version}`} style={styles.distRow}>
                              <Text style={styles.distVersion}>{row.version}</Text>
                              {badge && (
                                <View style={[styles.distBadge, { backgroundColor: badge.color }]}>
                                  <Text style={styles.distBadgeText}>{badge.text}</Text>
                                </View>
                              )}
                              <Text style={styles.distCount}>{row.count} utenti</Text>
                            </View>
                          );
                        })}
                      </View>
                    );
                  })
                )}
              </>
            )}
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="trash-outline" size={18} color="#FF8C00" />
              <Text style={styles.cardTitle}>Cache workspace</Text>
            </View>
            <Text style={styles.hintText}>
              Libera spazio eliminando la cache di build (.cache/, node_modules/.cache). L&apos;operazione gira in background e non interrompe il server.
            </Text>
            <TouchableOpacity
              style={[styles.actionBtnWide, { marginTop: 12, backgroundColor: "#FF8C00" }, isCleanupRunning && { opacity: 0.6 }]}
              onPress={handleCacheCleanup}
              disabled={isCleanupRunning}
            >
              {isCleanupRunning ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="trash-outline" size={16} color="#fff" />
                  <Text style={styles.actionBtnText}>Svuota cache workspace</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionTitle}>Ultimi eventi ({mergedEvents.length})</Text>
        </>
      }
      renderItem={({ item }) => {
        const icon = eventIcon(item.type);
        return (
          <View style={styles.eventRow}>
            <View style={styles.eventIconWrap}>
              <Ionicons name={icon.name} size={20} color={icon.color} />
            </View>
            <View style={styles.eventContent}>
              <Text style={styles.eventLabel}>{eventLabel(item.type)}</Text>
              <Text style={styles.eventMessage} numberOfLines={2}>
                {item.message}
              </Text>
              <Text style={styles.eventTime}>{formatTimestamp(item.timestamp)}</Text>
            </View>
          </View>
        );
      }}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListEmptyComponent={
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>Nessun evento registrato</Text>
        </View>
      }
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background,
    gap: 12,
  },
  loadingText: {
    color: Colors.textMuted ?? "#888",
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
  errorText: {
    color: "#FF4444",
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    textAlign: "center",
  },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: Colors.accent,
    borderRadius: 8,
  },
  retryBtnText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  listContent: {
    paddingHorizontal: 16,
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
  uptimeTimer: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 32,
    letterSpacing: 1,
  },
  startedAt: {
    color: Colors.textMuted ?? "#888",
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    marginTop: 4,
  },
  sectionTitle: {
    color: Colors.textMuted ?? "#888",
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 4,
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 12,
    gap: 12,
  },
  eventIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  eventContent: {
    flex: 1,
  },
  eventLabel: {
    color: Colors.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  eventMessage: {
    color: Colors.textMuted ?? "#888",
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    marginTop: 2,
  },
  eventTime: {
    color: Colors.textMuted ?? "#888",
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    marginTop: 4,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.border ?? "#333",
  },
  emptyWrap: {
    paddingVertical: 32,
    alignItems: "center",
  },
  emptyText: {
    color: Colors.textMuted ?? "#888",
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
  restartRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 5,
    borderTopWidth: 1,
    borderTopColor: Colors.border ?? "#333",
  },
  restartReason: {
    color: Colors.text,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    flex: 1,
  },
  restartTime: {
    color: Colors.textMuted ?? "#888",
    fontFamily: "Inter_400Regular",
    fontSize: 11,
  },
  nativeLabel: {
    color: Colors.accent,
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
    marginTop: 4,
  },
  nativeRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 8,
  },
  nativeField: {
    flex: 1,
  },
  nativeFieldLabel: {
    color: Colors.textMuted ?? "#888",
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    marginBottom: 4,
  },
  nativeInput: {
    backgroundColor: Colors.background,
    color: Colors.text,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.border ?? "#333",
  },
  nativeSaveBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
  },
  nativeSaveBtnText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  kvRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.border ?? "#333",
  },
  kvLabel: {
    color: Colors.textMuted ?? "#888",
    fontFamily: "Inter_400Regular",
    fontSize: 12,
  },
  kvValue: {
    color: Colors.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    flexShrink: 1,
    textAlign: "right",
    marginLeft: 8,
  },
  outcomeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 10,
    marginBottom: 12,
  },
  outcomeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    flex: 1,
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: Colors.accent,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
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
  },
  actionBtnDisabled: {
    opacity: 0.4,
  },
  actionBtnText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  hintText: {
    color: Colors.textMuted ?? "#888",
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    fontStyle: "italic",
    marginTop: 8,
    textAlign: "center",
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 4,
  },
  statBox: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border ?? "#333",
  },
  statValue: {
    color: Colors.text,
    fontFamily: "Inter_700Bold",
    fontSize: 18,
  },
  statLabel: {
    color: Colors.textMuted ?? "#888",
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    textAlign: "center",
    marginTop: 2,
  },
  distRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.border ?? "#333",
  },
  distVersion: {
    color: Colors.text,
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    flex: 1,
  },
  distBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  distBadgeText: {
    color: "#fff",
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 0.4,
  },
  distCount: {
    color: Colors.textMuted ?? "#888",
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
});
