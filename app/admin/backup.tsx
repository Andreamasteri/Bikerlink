import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Modal, TextInput, Platform, Switch, FlatList,
} from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { getApiUrl, queryClient, apiRequest } from "@/lib/query-client";

interface DriveFolder {
  id: string;
  name: string;
}

interface BackupStatus {
  scheduled: boolean;
  lastDbBackup: { timestamp: string; size: number } | null;
  lastMediaBackup: { timestamp: string; size: number } | null;
  isBackingUp: boolean;
  nextScheduled: string | null;
  nextMediaScheduled: string | null;
  driveFolder: { folderId: string; folderName: string } | null;
  dbHours: number;
  mediaHours: number;
  configured: boolean;
}

interface BrowseResult {
  folderName: string;
  folders: DriveFolder[];
  isSearch?: boolean;
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

function FolderPickerModal({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (folder: DriveFolder) => void;
}) {
  const [folderStack, setFolderStack] = useState<{ id: string | null; name: string }[]>([{ id: null, name: "Drive" }]);
  const current = folderStack[folderStack.length - 1];

  const { data, isLoading, error } = useQuery<BrowseResult>({
    queryKey: ["/api/admin/translations/browse-folders", current.id],
    queryFn: async () => {
      const url = new URL("/api/admin/translations/browse", getApiUrl());
      if (current.id) url.searchParams.set("folderId", current.id);
      const resp = await fetch(url.toString(), { credentials: "include" });
      if (!resp.ok) throw new Error("Errore Drive");
      const raw = await resp.json() as { folderName: string; folders: DriveFolder[]; sheets?: unknown[] };
      return { folderName: raw.folderName, folders: raw.folders };
    },
    enabled: visible,
  });

  function navigateInto(folder: DriveFolder) {
    setFolderStack((s) => [...s, { id: folder.id, name: folder.name }]);
  }

  function navigateBack() {
    setFolderStack((s) => s.length > 1 ? s.slice(0, -1) : s);
  }

  function handleClose() {
    setFolderStack([{ id: null, name: "Drive" }]);
    onClose();
  }

  function handleSelect(folder: DriveFolder) {
    setFolderStack([{ id: null, name: "Drive" }]);
    onSelect(folder);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={fpStyles.overlay}>
        <View style={fpStyles.sheet}>
          <View style={fpStyles.header}>
            {folderStack.length > 1 ? (
              <TouchableOpacity onPress={navigateBack} style={fpStyles.backBtn}>
                <Ionicons name="chevron-back" size={20} color={Colors.text} />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 36 }} />
            )}
            <Text style={fpStyles.title} numberOfLines={1}>{current.id ? current.name : "Scegli cartella Drive"}</Text>
            <TouchableOpacity onPress={handleClose} style={fpStyles.closeBtn}>
              <Ionicons name="close" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {current.id && (
            <TouchableOpacity
              style={fpStyles.selectCurrentBtn}
              onPress={() => handleSelect({ id: current.id!, name: current.name })}
            >
              <MaterialCommunityIcons name="folder-check" size={16} color="#fff" />
              <Text style={fpStyles.selectCurrentText}>Seleziona "{current.name}"</Text>
            </TouchableOpacity>
          )}

          {isLoading ? (
            <ActivityIndicator style={{ marginTop: 32 }} color={Colors.accent} />
          ) : error ? (
            <Text style={fpStyles.errorText}>Errore nel caricamento Drive</Text>
          ) : (data?.folders ?? []).length === 0 ? (
            <Text style={fpStyles.emptyText}>Nessuna sottocartella</Text>
          ) : (
            <FlatList
              data={data?.folders ?? []}
              keyExtractor={(f) => f.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={fpStyles.folderRow} onPress={() => navigateInto(item)}>
                  <MaterialCommunityIcons name="folder" size={20} color={Colors.accent} />
                  <Text style={fpStyles.folderName} numberOfLines={1}>{item.name}</Text>
                  <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
                </TouchableOpacity>
              )}
              style={{ maxHeight: 350 }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

export default function BackupScreen() {
  const insets = useSafeAreaInsets();
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [dbHoursInput, setDbHoursInput] = useState("");
  const [mediaHoursInput, setMediaHoursInput] = useState("");
  const [freqEditing, setFreqEditing] = useState(false);

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
      if (!res.ok) throw new Error(data.message || "Errore backup");
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
      if (!res.ok) throw new Error(data.message || "Errore backup media");
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

  const folderMutation = useMutation({
    mutationFn: async (folder: DriveFolder | null) => {
      const url = new URL("/api/admin/backup/drive-folder", getApiUrl()).toString();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(folder ? { folderId: folder.id, folderName: folder.name } : {}),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Errore");
      return data;
    },
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
      if (!res.ok) throw new Error(data.message || "Errore");
      return data;
    },
    onSuccess: () => {
      setFreqEditing(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/backup/status"] });
      refetchStatus();
    },
  });

  const handleFolderSelect = useCallback((folder: DriveFolder) => {
    setShowFolderPicker(false);
    folderMutation.mutate(folder);
  }, []);

  function saveFrequency() {
    const dbH = parseInt(dbHoursInput, 10);
    const mediaH = parseInt(mediaHoursInput, 10);
    if (!dbH || dbH < 1 || !mediaH || mediaH < 1) return;
    freqMutation.mutate({ dbHours: dbH, mediaHours: mediaH });
  }

  const isBackingUp = backupDbMutation.isPending || backupMediaMutation.isPending || status?.isBackingUp;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + 30, paddingTop: Platform.OS === "web" ? 67 : 0 },
      ]}
    >
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <MaterialCommunityIcons name="google-drive" size={22} color={Colors.accent} />
          <Text style={styles.cardTitle}>Cartella Drive</Text>
          {folderMutation.isPending && <ActivityIndicator size="small" color={Colors.accent} />}
        </View>
        {status?.driveFolder ? (
          <View style={styles.folderRow}>
            <MaterialCommunityIcons name="folder" size={18} color={Colors.accent} />
            <Text style={styles.folderName} numberOfLines={1}>{status.driveFolder.folderName}</Text>
            <TouchableOpacity onPress={() => setShowFolderPicker(true)} style={styles.changeFolderBtn}>
              <Text style={styles.changeFolderText}>Cambia</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.pickFolderBtn} onPress={() => setShowFolderPicker(true)}>
            <MaterialCommunityIcons name="folder-plus" size={18} color="#fff" />
            <Text style={styles.pickFolderText}>Scegli cartella</Text>
          </TouchableOpacity>
        )}
        {!status?.driveFolder && (
          <Text style={styles.hintText}>Scegli una cartella Drive per abilitare i backup automatici</Text>
        )}
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <MaterialCommunityIcons name="cloud-upload" size={22} color={Colors.accent} />
          <Text style={styles.cardTitle}>Backup automatico</Text>
          <Switch
            value={!!status?.scheduled}
            onValueChange={(v) => scheduleMutation.mutate(v)}
            disabled={scheduleMutation.isPending || !status?.driveFolder}
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
          </View>
          <View style={styles.divider} />
          <View style={styles.lastItem}>
            <Text style={styles.lastLabel}>Ultimo Media</Text>
            <Text style={styles.lastValue}>{status?.lastMediaBackup ? formatDate(status.lastMediaBackup.timestamp) : "—"}</Text>
            {status?.lastMediaBackup && <Text style={styles.lastSize}>{formatBytes(status.lastMediaBackup.size)}</Text>}
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
          style={[styles.actionBtn, styles.actionBtnGreen, (!!isBackingUp || !status?.driveFolder) && styles.btnDisabled]}
          onPress={() => backupDbMutation.mutate()}
          disabled={!!isBackingUp || !status?.driveFolder}
          activeOpacity={0.8}
        >
          {backupDbMutation.isPending
            ? <ActivityIndicator size="small" color="#fff" />
            : <MaterialCommunityIcons name="database-export" size={20} color="#fff" />
          }
          <Text style={styles.actionBtnText}>Backup DB ora</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnBlue, (!!isBackingUp || !status?.driveFolder) && styles.btnDisabled]}
          onPress={() => backupMediaMutation.mutate()}
          disabled={!!isBackingUp || !status?.driveFolder}
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

      <FolderPickerModal
        visible={showFolderPicker}
        onClose={() => setShowFolderPicker(false)}
        onSelect={handleFolderSelect}
      />
    </ScrollView>
  );
}

const fpStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, minHeight: 300 },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  backBtn: { padding: 8 },
  closeBtn: { padding: 8 },
  title: { flex: 1, fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.text, textAlign: "center" },
  selectCurrentBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.accent, borderRadius: 10, padding: 10, marginBottom: 12,
  },
  selectCurrentText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14, flex: 1 },
  folderRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  folderName: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text },
  emptyText: { textAlign: "center", color: Colors.textSecondary, fontFamily: "Inter_400Regular", fontSize: 14, marginTop: 32 },
  errorText: { textAlign: "center", color: Colors.error, fontFamily: "Inter_400Regular", fontSize: 14, marginTop: 32 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, gap: 16 },
  card: {
    backgroundColor: Colors.surface, borderRadius: 16,
    padding: 16, borderWidth: 1, borderColor: Colors.border,
  },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  cardTitle: { flex: 1, fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.text },
  folderRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  folderName: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text },
  changeFolderBtn: {
    backgroundColor: Colors.surface, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: Colors.border,
  },
  changeFolderText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.accent },
  pickFolderBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: Colors.accent, borderRadius: 10, padding: 12,
  },
  pickFolderText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  hintText: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, marginTop: 8 },
  statusSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, marginBottom: 4, marginLeft: 32 },
  lastRow: { flexDirection: "row", borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 12, marginTop: 4 },
  lastItem: { flex: 1, alignItems: "center" },
  lastLabel: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginBottom: 2 },
  lastValue: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: Colors.text, textAlign: "center" },
  lastSize: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
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
