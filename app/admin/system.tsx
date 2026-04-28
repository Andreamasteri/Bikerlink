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
  Modal,
  KeyboardAvoidingView,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useNavigation, useRouter } from "expo-router";
import Constants from "expo-constants";
import otaUpdatesRaw from "@/ota-updates.json";
import { getApiUrl, authFetchHeaders, silentAuthRecheck } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import { evaluateUpdateOutcome, type UpdateOutcome } from "@/lib/semver";
import {
  triggerSoftPreview,
  triggerForcedPreview,
  forceRecheck,
} from "@/components/NativeUpdateChecker";
import { runManualOtaCheck } from "@/lib/ota-check";

// ── Module-scope per garantire identità stabile della classe tra i render.
// Dichiarare AdminFetchError dentro il componente farebbe sì che `instanceof`
// fallisca quando React Query restituisce un errore cached creato in un render
// precedente con una classe ormai diversa.
type AdminFetchErrorCode = "session_expired" | "forbidden" | "server_error" | "network";
class AdminFetchError extends Error {
  code: AdminFetchErrorCode;
  status?: number;
  reason?: string;
  constructor(code: AdminFetchErrorCode, message: string, status?: number, reason?: string) {
    super(message);
    this.name = "AdminFetchError";
    this.code = code;
    this.status = status;
    this.reason = reason;
  }
}
const isAdminError = (e: unknown): e is AdminFetchError =>
  e instanceof AdminFetchError ||
  (e instanceof Error && e.name === "AdminFetchError" && "code" in e);

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
}

interface OtaEventsResponse {
  events: OtaEventRow[];
  limit: number;
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
  const [isPurging, setIsPurging] = useState(false);
  const [purgeModalVisible, setPurgeModalVisible] = useState(false);
  const [purgeConfirmText, setPurgeConfirmText] = useState("");

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

  const router = useRouter();
  const { sessionExpired, logoutMutation, user } = useAuth();
  const isAdmin = user?.role === "admin";

  const executePurge = useCallback(async () => {
    if (purgeConfirmText.trim().toUpperCase() !== "PURGA") {
      Alert.alert("Conferma errata", "Devi scrivere esattamente PURGA per procedere.");
      return;
    }
    setPurgeModalVisible(false);
    setPurgeConfirmText("");
    setIsPurging(true);
    try {
      const res = await fetch(
        new URL("/api/admin/purge-non-admin-users", getApiUrl()).toString(),
        {
          method: "DELETE",
          credentials: "include",
          headers: { "X-Confirm-Purge": "PURGE-CONFIRMED" },
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        Alert.alert("Errore", (body as { message?: string }).message ?? "Errore server");
        return;
      }
      const body = await res.json() as { purged: boolean; deletedUsers: number };
      Alert.alert(
        "Purga completata",
        `Eliminati ${body.deletedUsers} utenti non-admin.\nLe sessioni sono state invalidate.\nVerrai reindirizzato al login.`,
        [
          {
            text: "OK",
            onPress: async () => {
              try { await logoutMutation.mutateAsync(); } catch {}
              router.replace("/(auth)/login");
            },
          },
        ]
      );
    } catch {
      Alert.alert("Errore", "Impossibile contattare il server.");
    } finally {
      setIsPurging(false);
    }
  }, [purgeConfirmText, logoutMutation, router]);

  const handlePurgeNonAdminUsers = useCallback(() => {
    Alert.alert(
      "Purga DB utenti",
      "Questa azione elimina TUTTI gli utenti non-admin (moderatori, utenti normali) e invalida tutte le sessioni attive. L'operazione è irreversibile.",
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Continua",
          style: "destructive",
          onPress: () => {
            setPurgeConfirmText("");
            setPurgeModalVisible(true);
          },
        },
      ]
    );
  }, []);

  const fetchSystemHealth = useCallback(async (signal?: AbortSignal): Promise<SystemHealth> => {
    const url = new URL("/api/admin/system-health", getApiUrl());
    const doFetch = () =>
      fetch(url.toString(), {
        headers: authFetchHeaders(),
        credentials: "include",
        signal,
      });

    let res: Response;
    try {
      res = await doFetch();
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") throw e;
      throw new AdminFetchError("network", "network_unavailable");
    }

    // ── 401: silent re-auth one-shot prima di dichiarare la sessione scaduta.
    // Caso tipico: cookie connect.sid stale dopo cold start, ma il Bearer
    // token in AsyncStorage è ancora valido. Se /api/auth/me risponde 200,
    // ritentiamo la fetch silenziosamente; se risponde 401, la sessione è
    // davvero scaduta e segnaliamo l'errore tipizzato.
    if (res.status === 401) {
      const stillValid = await silentAuthRecheck();
      if (stillValid) {
        try {
          res = await doFetch();
        } catch (e: unknown) {
          if (e instanceof Error && e.name === "AbortError") throw e;
          throw new AdminFetchError("network", "network_unavailable");
        }
      }
    }

    if (res.status === 401 || res.status === 403) {
      let reason: string | undefined;
      try {
        const body = (await res.json()) as { reason?: string };
        reason = body?.reason;
      } catch {}
      throw new AdminFetchError(
        res.status === 401 ? "session_expired" : "forbidden",
        res.status === 401 ? "session_expired" : "forbidden",
        res.status,
        reason,
      );
    }
    if (!res.ok) {
      throw new AdminFetchError("server_error", `server_${res.status}`, res.status);
    }
    return (await res.json()) as SystemHealth;
  }, []);

  const { data, isLoading, error, refetch, isFetching } = useQuery<SystemHealth, AdminFetchError>({
    queryKey: ["/api/admin/system-health"],
    queryFn: ({ signal }) => fetchSystemHealth(signal),
    refetchInterval: 30000,
    retry: (count, e) => {
      if (isAdminError(e) && (e.code === "session_expired" || e.code === "forbidden")) return false;
      return count < 2;
    },
  });

  const { data: restartHistory } = useQuery<RestartHistory>({
    queryKey: ["/api/admin/restart-history"],
    refetchInterval: 60000,
  });

  const {
    data: otaEventsData,
    refetch: refetchOtaEvents,
    isFetching: isFetchingOtaEvents,
  } = useQuery<OtaEventsResponse>({
    queryKey: ["/api/admin/ota-events"],
    refetchInterval: 10000,
  });

  const [isManualOtaRunning, setIsManualOtaRunning] = useState(false);
  const handleManualOtaCheck = useCallback(async () => {
    setIsManualOtaRunning(true);
    try {
      const result = await runManualOtaCheck();
      if (result.skipped === "dev") {
        Alert.alert("OTA non disponibile", "Il check OTA è disabilitato in modalità sviluppo.");
      } else if (result.skipped === "web") {
        Alert.alert("OTA non disponibile", "Il check OTA è disabilitato sul web.");
      } else if (result.ok) {
        Alert.alert(
          "Check OTA completato",
          `Esito: ${result.phase}` + (result.phase === "reload" ? "\nL'app sta per ricaricarsi." : ""),
        );
      } else {
        Alert.alert("Check OTA fallito", `Phase: ${result.phase}\n${result.error ?? "Errore sconosciuto"}`);
      }
      // Aggiorna la lista eventi (anche in caso di errore: l'evento è stato loggato).
      setTimeout(() => { refetchOtaEvents(); }, 800);
    } catch (e) {
      Alert.alert("Errore", `Impossibile avviare il check OTA: ${String(e)}`);
    } finally {
      setIsManualOtaRunning(false);
    }
  }, [refetchOtaEvents]);

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

  if (error || !data) {
    const code = isAdminError(error) ? error.code : undefined;
    const status = isAdminError(error) ? error.status : undefined;
    const reason = isAdminError(error) ? error.reason : undefined;
    // sessionExpired da auth-context ha priorità: viene settato dal recheck
    // /api/auth/me quando la sessione è realmente persa.
    const isSessionGone = code === "session_expired" || sessionExpired;

    let title = "Errore nel caricamento dei dati";
    let hint = "";
    let iconColor = "#FF4444";
    if (isSessionGone) {
      title = "Sessione scaduta";
      hint = "La tua sessione admin non è più valida. Effettua di nuovo l'accesso per riaprire il monitor.";
      iconColor = "#FFA500";
    } else if (code === "forbidden") {
      title = "Accesso non autorizzato";
      // Accetta sia il formato corrente "not-admin" sia il legacy "not_admin"
      // per garantire la corretta UX se il backend viene rolled-back.
      const isNotAdmin = reason === "not-admin" || reason === "not_admin";
      hint = isNotAdmin
        ? "Il tuo account non ha i permessi di amministratore."
        : "Il server ha rifiutato la richiesta (403).";
    } else if (code === "server_error") {
      title = `Errore server (HTTP ${status ?? "?"})`;
      hint = "Il backend ha risposto con un errore. Riprova tra qualche secondo o controlla i log di produzione.";
    } else if (code === "network") {
      title = "Server non raggiungibile";
      hint = "Verifica la connessione e riprova.";
    } else if (error?.message) {
      hint = String(error.message);
    } else {
      hint = "Risposta vuota dal server.";
    }

    const goToLogin = async () => {
      try { await logoutMutation.mutateAsync(); } catch {}
      router.replace("/(auth)/login");
    };

    return (
      <View style={[styles.center, { paddingTop: topPadding }]}>
        <Ionicons name="warning-outline" size={40} color={iconColor} />
        <Text style={styles.errorText}>{title}</Text>
        {hint ? (
          <Text style={[styles.loadingText, { textAlign: "center", paddingHorizontal: 24, marginTop: 4 }]}>
            {hint}
          </Text>
        ) : null}
        {isSessionGone ? (
          <>
            <TouchableOpacity style={styles.retryBtn} onPress={goToLogin}>
              <Text style={styles.retryBtnText}>Vai al login</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.retryBtn, { backgroundColor: "transparent", marginTop: 8 }]}
              onPress={handleRefresh}
            >
              <Text style={[styles.retryBtnText, { color: Colors.accent }]}>Riprova</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={styles.retryBtn} onPress={handleRefresh}>
            <Text style={styles.retryBtnText}>Riprova</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <>
      <Modal
        visible={purgeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => { setPurgeModalVisible(false); setPurgeConfirmText(""); }}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.modalBox}>
            <Ionicons name="nuclear-outline" size={32} color="#FF4444" />
            <Text style={styles.modalTitle}>Conferma purga</Text>
            <Text style={styles.modalBody}>
              Stai per eliminare tutti gli utenti non-admin. Questa operazione è irreversibile.{"\n\n"}
              Scrivi <Text style={{ color: "#FF4444", fontFamily: "Inter_700Bold" }}>PURGA</Text> nel campo qui sotto per confermare.
            </Text>
            <TextInput
              style={styles.modalInput}
              value={purgeConfirmText}
              onChangeText={setPurgeConfirmText}
              placeholder="PURGA"
              placeholderTextColor={Colors.textMuted ?? "#666"}
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: Colors.surface }]}
                onPress={() => { setPurgeModalVisible(false); setPurgeConfirmText(""); }}
              >
                <Text style={[styles.modalBtnText, { color: Colors.text }]}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  { backgroundColor: purgeConfirmText.trim().toUpperCase() === "PURGA" ? "#CC0000" : "#555" },
                ]}
                onPress={executePurge}
              >
                <Text style={styles.modalBtnText}>Elimina tutto</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

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
              <Ionicons name="cloud-done-outline" size={18} color={Colors.accent} />
              <Text style={styles.cardTitle}>Aggiornamenti OTA</Text>
              <View style={[styles.badge, { backgroundColor: Colors.accent }]}>
                <Text style={styles.badgeText}>{otaEventsData?.events.length ?? 0}</Text>
              </View>
              <TouchableOpacity onPress={() => refetchOtaEvents()} disabled={isFetchingOtaEvents} style={{ marginLeft: 8 }}>
                {isFetchingOtaEvents ? (
                  <ActivityIndicator size="small" color={Colors.accent} />
                ) : (
                  <Ionicons name="refresh" size={18} color={Colors.accent} />
                )}
              </TouchableOpacity>
            </View>

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
              Bypassa il cooldown e contatta /api/expo-updates. L&apos;esito viene loggato in DB e mostrato sotto.
            </Text>

            {(otaEventsData?.events ?? []).length === 0 ? (
              <Text style={[styles.hintText, { marginTop: 12 }]}>Nessun evento OTA registrato.</Text>
            ) : (
              (otaEventsData?.events ?? []).slice(0, 100).map((e) => {
                const isErr = !!e.error && !e.error.startsWith("ok:");
                const color = isErr ? "#FF4444" : "#44AA44";
                const icon: keyof typeof Ionicons.glyphMap = isErr ? "alert-circle-outline" : "checkmark-circle-outline";
                return (
                  <View key={e.id} style={styles.restartRow}>
                    <Ionicons name={icon} size={14} color={color} />
                    <View style={{ flex: 1, marginLeft: 6 }}>
                      <Text style={[styles.restartReason, { fontSize: 11 }]} numberOfLines={2}>
                        {e.phase}{e.source ? ` · ${e.source}` : ""}{e.platform ? ` · ${e.platform}` : ""}
                        {e.error ? ` — ${e.error}` : ""}
                      </Text>
                      <Text style={styles.restartTime}>
                        rv={e.runtime_version ?? "?"} · uid={(e.current_update_id ?? "?").substring(0, 12)}
                        {e.release_id ? ` · rel=${e.release_id.substring(0, 8)}` : ""}
                        {e.fail_count > 0 ? ` · fail#${e.fail_count}` : ""} · {formatTimestamp(e.created_at)}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>

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

          {isAdmin && (
            <View style={[styles.card, { borderWidth: 1, borderColor: "#FF4444" }]}>
              <View style={styles.cardHeader}>
                <Ionicons name="nuclear-outline" size={18} color="#FF4444" />
                <Text style={[styles.cardTitle, { color: "#FF4444" }]}>Purga DB utenti</Text>
              </View>
              <Text style={styles.hintText}>
                Elimina TUTTI gli utenti non-admin (moderatori + utenti normali) e invalida le sessioni attive. Gli account reviewer vengono ri-creati al riavvio del backend. Operazione irreversibile.
              </Text>
              <TouchableOpacity
                style={[styles.actionBtnWide, { marginTop: 12, backgroundColor: "#CC0000" }, isPurging && { opacity: 0.5 }]}
                onPress={handlePurgeNonAdminUsers}
                disabled={isPurging}
                testID="purge-users-btn"
              >
                {isPurging ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="trash-bin-outline" size={16} color="#fff" />
                    <Text style={styles.actionBtnText}>Purga tutti gli utenti non-admin</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

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
    </>
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  modalBox: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "#FF4444",
  },
  modalTitle: {
    color: "#FF4444",
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    textAlign: "center",
  },
  modalBody: {
    color: Colors.text,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  modalInput: {
    backgroundColor: Colors.background,
    color: Colors.text,
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 2,
    borderColor: "#FF4444",
    width: "100%",
    textAlign: "center",
    letterSpacing: 2,
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    width: "100%",
  },
  modalBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  modalBtnText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
});
