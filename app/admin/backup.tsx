import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, TextInput,  Switch, Alert,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import Colors from "@/constants/colors";
import { getApiUrl, queryClient, apiRequest, authFetchHeaders } from "@/lib/query-client";
import { useT } from "@/lib/language-context";

interface BackupStatus {
  scheduled: boolean;
  autoEnabled: boolean;
  lastDbBackup: { timestamp: string; size: number; objectPath?: string; fileName?: string } | null;
  lastMediaBackup: { timestamp: string; size: number; objectPath?: string; fileName?: string } | null;
  isBackingUp: boolean;
  nextScheduled: string | null;
  nextMediaScheduled: string | null;
  storage: { type: "object_storage"; prefix: string };
  dbHours: number;
  mediaHours: number;
  configured: boolean;
}

function formatBytes(bytes: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("it-IT", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function BackupScreen() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [dbHoursInput, setDbHoursInput] = useState("");
  const [mediaHoursInput, setMediaHoursInput] = useState("");
  const [freqEditing, setFreqEditing] = useState(false);
  const [downloadingType, setDownloadingType] = useState<null | "db" | "media">(null);

  const freqInitialized = useRef(false);
  const { data: status, refetch: refetchStatus } = useQuery<BackupStatus>({
    queryKey: ["/api/admin/backup/status"],
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (status && !freqInitialized.current && !freqEditing) {
      freqInitialized.current = true;
      setDbHoursInput(String(status.dbHours));
      setMediaHoursInput(String(status.mediaHours));
    }
  }, [status, freqEditing]);

  const backupDbMutation = useMutation({
    mutationFn: async () => {
      const url = new URL("/api/admin/backup/db", getApiUrl()).toString();
      const res = await fetch(url, { method: "POST", credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || t("admin.backupErrorMsg"));
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/backup/status"] });
      refetchStatus();
    },
  });

  const backupMediaMutation = useMutation({
    mutationFn: async () => {
      const url = new URL("/api/admin/backup/media", getApiUrl()).toString();
      const res = await fetch(url, { method: "POST", credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || t("admin.backupMediaErrorMsg"));
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/backup/status"] });
      refetchStatus();
    },
  });

  const scheduleMutation = useMutation({
    mutationFn: async (enabled: boolean) => apiRequest("PUT", "/api/admin/backup/schedule", { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/backup/status"] });
      refetchStatus();
    },
  });

  const freqMutation = useMutation({
    mutationFn: async ({ dbHours, mediaHours }: { dbHours: number; mediaHours: number }) => {
      const url = new URL("/api/admin/backup/frequency", getApiUrl()).toString();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dbHours, mediaHours }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || t("admin.genericError"));
      return data;
    },
    onSuccess: () => {
      setFreqEditing(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/backup/status"] });
      refetchStatus();
    },
  });

  function saveFrequency() {
    const dbH = parseInt(dbHoursInput, 10);
    const mediaH = parseInt(mediaHoursInput, 10);
    if (!dbH || dbH < 1 || !mediaH || mediaH < 1) return;
    freqMutation.mutate({ dbHours: dbH, mediaHours: mediaH });
  }

  async function handleDownload(type: "db" | "media") {
    const meta = type === "db" ? status?.lastDbBackup : status?.lastMediaBackup;
    if (!meta) {
      Alert.alert("Nessun backup", "Esegui prima un backup manuale o automatico.");
      return;
    }
    setDownloadingType(type);
    try {
      const url = new URL(`/api/admin/backup/download/${type}`, getApiUrl()).toString();
      const fileName = meta.fileName
        || (type === "db" ? "bikerlink_db.sql.gz" : "bikerlink_media.zip");

      const filePath = `${FileSystem.cacheDirectory}${fileName}`;
      const dl = await FileSystem.downloadAsync(url, filePath, {
        headers: authFetchHeaders(),
      });
      if (dl.status !== 200) throw new Error(`HTTP ${dl.status}`);
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(dl.uri, {
          dialogTitle: `Salva ${fileName}`,
          mimeType: type === "db" ? "application/gzip" : "application/zip",
        });
      } else {
        Alert.alert("Scaricato", `Salvato in: ${dl.uri}`);
      }
    } catch (err: unknown) {
      Alert.alert("Errore download", (err instanceof Error ? err.message : null) || "Impossibile scaricare");
    } finally {
      setDownloadingType(null);
    }
  }

  const isBackingUp = backupDbMutation.isPending || backupMediaMutation.isPending || status?.isBackingUp;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + 30, paddingTop: 0 },
      ]}
    >
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <MaterialCommunityIcons name="cloud-lock" size={22} color={Colors.accent} />
          <Text style={styles.cardTitle}>Object Storage</Text>
        </View>
        <Text style={styles.storageInfo}>
          I backup vengono salvati automaticamente sull'Object Storage privato di Replit.
        </Text>
        <Text style={styles.storagePath}>
          {status?.storage?.prefix || ".private/backups"}/
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <MaterialCommunityIcons name="cloud-upload" size={22} color={Colors.accent} />
          <Text style={styles.cardTitle}>Backup automatico</Text>
          <Switch
            value={!!status?.scheduled}
            onValueChange={(v) => scheduleMutation.mutate(v)}
            disabled={scheduleMutation.isPending}
            trackColor={{ false: Colors.border, true: Colors.accent }}
            thumbColor="#fff"
          />
        </View>
        {status?.nextScheduled && (
          <Text style={styles.statusSub}>Prossimo DB: {formatDate(status.nextScheduled)}</Text>
        )}
        {status?.nextMediaScheduled && (
          <Text style={styles.statusSub}>Prossimo Media: {formatDate(status.nextMediaScheduled)}</Text>
        )}
        <View style={styles.lastRow}>
          <View style={styles.lastItem}>
            <Text style={styles.lastLabel}>Ultimo DB</Text>
            <Text style={styles.lastValue}>{status?.lastDbBackup ? formatDate(status.lastDbBackup.timestamp) : "—"}</Text>
            {status?.lastDbBackup && <Text style={styles.lastSize}>{formatBytes(status.lastDbBackup.size)}</Text>}
            <TouchableOpacity
              style={[styles.downloadBtn, (!status?.lastDbBackup || downloadingType === "db") && styles.btnDisabled]}
              onPress={() => handleDownload("db")}
              disabled={!status?.lastDbBackup || downloadingType === "db"}
            >
              {downloadingType === "db"
                ? <ActivityIndicator size="small" color={Colors.accent} />
                : <MaterialCommunityIcons name="download" size={16} color={Colors.accent} />}
              <Text style={styles.downloadBtnText}>Scarica</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.divider} />
          <View style={styles.lastItem}>
            <Text style={styles.lastLabel}>Ultimo Media</Text>
            <Text style={styles.lastValue}>{status?.lastMediaBackup ? formatDate(status.lastMediaBackup.timestamp) : "—"}</Text>
            {status?.lastMediaBackup && <Text style={styles.lastSize}>{formatBytes(status.lastMediaBackup.size)}</Text>}
            <TouchableOpacity
              style={[styles.downloadBtn, (!status?.lastMediaBackup || downloadingType === "media") && styles.btnDisabled]}
              onPress={() => handleDownload("media")}
              disabled={!status?.lastMediaBackup || downloadingType === "media"}
            >
              {downloadingType === "media"
                ? <ActivityIndicator size="small" color={Colors.accent} />
                : <MaterialCommunityIcons name="download" size={16} color={Colors.accent} />}
              <Text style={styles.downloadBtnText}>Scarica</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <MaterialCommunityIcons name="timer-outline" size={22} color={Colors.accent} />
          <Text style={styles.cardTitle}>Frequenza backup</Text>
        </View>
        <View style={styles.freqRow}>
          <View style={styles.freqItem}>
            <Text style={styles.freqLabel}>Database (ore)</Text>
            <TextInput
              style={styles.freqInput}
              value={dbHoursInput}
              onChangeText={(t) => { setFreqEditing(true); setDbHoursInput(t.replace(/[^0-9]/g, "")); }}
              keyboardType="number-pad"
              placeholder="24"
              placeholderTextColor={Colors.textSecondary}
            />
          </View>
          <View style={styles.freqItem}>
            <Text style={styles.freqLabel}>Media (ore)</Text>
            <TextInput
              style={styles.freqInput}
              value={mediaHoursInput}
              onChangeText={(t) => { setFreqEditing(true); setMediaHoursInput(t.replace(/[^0-9]/g, "")); }}
              keyboardType="number-pad"
              placeholder="168"
              placeholderTextColor={Colors.textSecondary}
            />
          </View>
          <TouchableOpacity
            style={[styles.saveFreqBtn, freqMutation.isPending && styles.btnDisabled]}
            onPress={saveFrequency}
            disabled={freqMutation.isPending}
          >
            {freqMutation.isPending
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.saveFreqText}>Salva</Text>
            }
          </TouchableOpacity>
        </View>
        {freqMutation.isError && (
          <Text style={styles.errorText}>{(freqMutation.error as Error).message}</Text>
        )}
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnGreen, !!isBackingUp && styles.btnDisabled]}
          onPress={() => backupDbMutation.mutate()}
          disabled={!!isBackingUp}
          activeOpacity={0.8}
        >
          {backupDbMutation.isPending
            ? <ActivityIndicator size="small" color="#fff" />
            : <MaterialCommunityIcons name="database-export" size={20} color="#fff" />
          }
          <Text style={styles.actionBtnText}>Backup DB ora</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnBlue, !!isBackingUp && styles.btnDisabled]}
          onPress={() => backupMediaMutation.mutate()}
          disabled={!!isBackingUp}
          activeOpacity={0.8}
        >
          {backupMediaMutation.isPending
            ? <ActivityIndicator size="small" color="#fff" />
            : <MaterialCommunityIcons name="folder-zip" size={20} color="#fff" />
          }
          <Text style={styles.actionBtnText}>Backup Media ora</Text>
        </TouchableOpacity>
      </View>

      {backupDbMutation.isError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{(backupDbMutation.error as Error).message}</Text>
        </View>
      )}
      {backupMediaMutation.isError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{(backupMediaMutation.error as Error).message}</Text>
        </View>
      )}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 16 },
  card: {
    backgroundColor: Colors.surface, borderRadius: 16,
    padding: 16, borderWidth: 1, borderColor: Colors.border,
  },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  cardTitle: { flex: 1, fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.text },
  storageInfo: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, marginBottom: 8 },
  storagePath: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.accent },
  statusSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, marginBottom: 4, marginLeft: 32 },
  lastRow: { flexDirection: "row", borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 12, marginTop: 4 },
  lastItem: { flex: 1, alignItems: "center" },
  lastLabel: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginBottom: 2 },
  lastValue: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: Colors.text, textAlign: "center" },
  lastSize: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  downloadBtn: {
    marginTop: 8, flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    borderWidth: 1, borderColor: Colors.accent + "40",
  },
  downloadBtnText: { color: Colors.accent, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  divider: { width: 1, backgroundColor: Colors.border, marginHorizontal: 8 },
  freqRow: { flexDirection: "row", alignItems: "flex-end", gap: 10 },
  freqItem: { flex: 1 },
  freqLabel: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, marginBottom: 6 },
  freqInput: {
    backgroundColor: Colors.background, borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: Colors.border,
    color: Colors.text, fontSize: 15, fontFamily: "Inter_600SemiBold", textAlign: "center",
  },
  saveFreqBtn: {
    backgroundColor: Colors.accent, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, alignItems: "center", justifyContent: "center",
  },
  saveFreqText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  actionsRow: { flexDirection: "row", gap: 12 },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderRadius: 12, paddingVertical: 14,
  },
  actionBtnGreen: { backgroundColor: "#22c55e" },
  actionBtnBlue: { backgroundColor: Colors.accent },
  actionBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  btnDisabled: { opacity: 0.5 },
  errorBanner: {
    backgroundColor: Colors.error + "20", borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: Colors.error + "40",
  },
  errorText: { color: Colors.error, fontSize: 13, fontFamily: "Inter_400Regular" },
});
