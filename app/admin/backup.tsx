import React, { useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Modal, TextInput, Platform, Switch, Linking,
} from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { getApiUrl, queryClient, apiRequest } from "@/lib/query-client";

interface BackupFile {
  path: string;
  name: string;
  size: number;
  createdTime: string;
}

interface BackupList {
  db: BackupFile[];
  media: BackupFile[];
}

interface BackupStatus {
  scheduled: boolean;
  lastDbBackup: { timestamp: string; size: number } | null;
  lastMediaBackup: { timestamp: string; size: number } | null;
  isBackingUp: boolean;
  isRestoringDb: boolean;
  nextScheduled: string | null;
  nextMediaScheduled: string | null;
  configured: boolean;
}

type Tab = "db" | "media";

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
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<Tab>("db");
  const [restoreModal, setRestoreModal] = useState<{ file: BackupFile } | null>(null);
  const [restorePassword, setRestorePassword] = useState("");

  const { data: status, refetch: refetchStatus } = useQuery<BackupStatus>({
    queryKey: ["/api/admin/backup/status"],
    refetchInterval: 5000,
  });

  const { data: backups, isLoading: loadingBackups, refetch: refetchBackups } = useQuery<BackupList>({
    queryKey: ["/api/admin/backup/list"],
  });

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
      queryClient.invalidateQueries({ queryKey: ["/api/admin/backup/list"] });
      refetchStatus();
      refetchBackups();
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
      queryClient.invalidateQueries({ queryKey: ["/api/admin/backup/list"] });
      refetchStatus();
      refetchBackups();
    },
  });

  const scheduleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      return apiRequest("PUT", "/api/admin/backup/schedule", { enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/backup/status"] });
      refetchStatus();
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async ({ filePath, adminPassword }: { filePath: string; adminPassword: string }) => {
      const url = new URL("/api/admin/backup/restore", getApiUrl()).toString();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath, adminPassword }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Errore ripristino");
      return data;
    },
    onSuccess: () => {
      setRestoreModal(null);
      setRestorePassword("");
    },
  });

  function handleDownload(filePath: string) {
    const url = new URL("/api/admin/backup/download", getApiUrl());
    url.searchParams.set("path", filePath);
    Linking.openURL(url.toString());
  }

  const isBackingUp = backupDbMutation.isPending || backupMediaMutation.isPending || status?.isBackingUp;
  const isRestoring = restoreMutation.isPending || status?.isRestoringDb;

  const currentList = activeTab === "db" ? (backups?.db || []) : (backups?.media || []);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + 30, paddingTop: Platform.OS === "web" ? 67 : 0 },
      ]}
    >
      <View style={styles.statusCard}>
        <View style={styles.statusRow}>
          <MaterialCommunityIcons name="cloud-upload" size={24} color={Colors.accent} />
          <Text style={styles.statusTitle}>Backup automatico</Text>
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
        <View style={styles.retentionRow}>
          <Ionicons name="information-circle-outline" size={14} color={Colors.textSecondary} />
          <Text style={styles.retentionText}>I backup vengono eliminati automaticamente dopo 3 mesi</Text>
        </View>

        <View style={styles.lastBackupRow}>
          <View style={styles.lastBackupItem}>
            <Text style={styles.lastBackupLabel}>Ultimo DB</Text>
            <Text style={styles.lastBackupValue}>
              {status?.lastDbBackup ? formatDate(status.lastDbBackup.timestamp) : "—"}
            </Text>
            {status?.lastDbBackup && (
              <Text style={styles.lastBackupSize}>{formatBytes(status.lastDbBackup.size)}</Text>
            )}
          </View>
          <View style={styles.divider} />
          <View style={styles.lastBackupItem}>
            <Text style={styles.lastBackupLabel}>Ultimo Media</Text>
            <Text style={styles.lastBackupValue}>
              {status?.lastMediaBackup ? formatDate(status.lastMediaBackup.timestamp) : "—"}
            </Text>
            {status?.lastMediaBackup && (
              <Text style={styles.lastBackupSize}>{formatBytes(status.lastMediaBackup.size)}</Text>
            )}
          </View>
        </View>
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

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "db" && styles.tabActive]}
          onPress={() => setActiveTab("db")}
        >
          <Text style={[styles.tabText, activeTab === "db" && styles.tabTextActive]}>
            Database ({backups?.db?.length ?? 0})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "media" && styles.tabActive]}
          onPress={() => setActiveTab("media")}
        >
          <Text style={[styles.tabText, activeTab === "media" && styles.tabTextActive]}>
            Media ({backups?.media?.length ?? 0})
          </Text>
        </TouchableOpacity>
      </View>

      {loadingBackups ? (
        <ActivityIndicator style={{ marginTop: 32 }} color={Colors.accent} />
      ) : currentList.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialCommunityIcons name="cloud-outline" size={48} color={Colors.textSecondary} />
          <Text style={styles.emptyText}>Nessun backup disponibile</Text>
        </View>
      ) : (
        currentList.map((file) => (
          <View key={file.path} style={styles.backupCard}>
            <MaterialCommunityIcons
              name={activeTab === "db" ? "database" : "folder-zip"}
              size={24}
              color={activeTab === "db" ? Colors.success : Colors.accent}
              style={{ marginRight: 12 }}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.backupName} numberOfLines={1}>{file.name}</Text>
              <Text style={styles.backupMeta}>
                {formatDate(file.createdTime)} · {formatBytes(file.size)}
              </Text>
            </View>
            <View style={styles.fileActions}>
              <TouchableOpacity
                style={styles.downloadBtn}
                onPress={() => handleDownload(file.path)}
              >
                <Ionicons name="download-outline" size={16} color="#fff" />
              </TouchableOpacity>
              {activeTab === "db" && (
                <TouchableOpacity
                  style={[styles.restoreBtn, isRestoring && styles.btnDisabled]}
                  onPress={() => {
                    setRestoreModal({ file });
                    setRestorePassword("");
                  }}
                  disabled={!!isRestoring}
                >
                  <Ionicons name="refresh" size={16} color="#fff" />
                  <Text style={styles.restoreBtnText}>Ripristina</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))
      )}

      <Modal visible={!!restoreModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Ionicons name="warning" size={24} color={Colors.error} />
              <Text style={styles.modalTitle}>Ripristina database</Text>
            </View>
            <Text style={styles.modalDesc}>
              Stai per sostituire il database attuale con:{"\n"}
              <Text style={{ fontWeight: "700" }}>{restoreModal?.file.name}</Text>
              {"\n\nQuesta operazione è irreversibile. Inserisci la password admin per confermare."}
            </Text>
            <TextInput
              style={styles.passwordInput}
              placeholder="Password admin"
              placeholderTextColor={Colors.textSecondary}
              secureTextEntry
              value={restorePassword}
              onChangeText={setRestorePassword}
              autoCapitalize="none"
            />
            {restoreMutation.isError && (
              <Text style={styles.modalError}>{(restoreMutation.error as Error).message}</Text>
            )}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => { setRestoreModal(null); setRestorePassword(""); restoreMutation.reset(); }}
              >
                <Text style={styles.cancelBtnText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, (restoreMutation.isPending || !restorePassword) && styles.btnDisabled]}
                onPress={() => restoreModal && restoreMutation.mutate({ filePath: restoreModal.file.path, adminPassword: restorePassword })}
                disabled={restoreMutation.isPending || !restorePassword}
              >
                {restoreMutation.isPending
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.confirmBtnText}>Ripristina</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16 },
  statusCard: {
    backgroundColor: Colors.surface, borderRadius: 16,
    padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: Colors.border,
  },
  statusRow: {
    flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4,
  },
  statusTitle: {
    flex: 1, fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.text,
  },
  statusSub: {
    fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary, marginBottom: 6, marginLeft: 34,
  },
  retentionRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginTop: 4, marginBottom: 12,
  },
  retentionText: {
    fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, flex: 1,
  },
  lastBackupRow: {
    flexDirection: "row", borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 12,
  },
  lastBackupItem: { flex: 1, alignItems: "center" },
  lastBackupLabel: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginBottom: 2 },
  lastBackupValue: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: Colors.text, textAlign: "center" },
  lastBackupSize: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  divider: { width: 1, backgroundColor: Colors.border, marginHorizontal: 8 },
  actionsRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderRadius: 12, paddingVertical: 14,
  },
  actionBtnGreen: { backgroundColor: "#22c55e" },
  actionBtnBlue: { backgroundColor: Colors.accent },
  actionBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  btnDisabled: { opacity: 0.5 },
  errorBanner: {
    backgroundColor: Colors.error + "20", borderRadius: 10, padding: 10, marginBottom: 12,
    borderWidth: 1, borderColor: Colors.error + "40",
  },
  errorText: { color: Colors.error, fontSize: 13, fontFamily: "Inter_400Regular" },
  tabRow: {
    flexDirection: "row", borderRadius: 12,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    marginBottom: 16, padding: 4,
  },
  tab: {
    flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 10,
  },
  tabActive: { backgroundColor: Colors.accent },
  tabText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.textSecondary },
  tabTextActive: { color: "#fff" },
  emptyState: {
    alignItems: "center", paddingVertical: 40, gap: 12,
  },
  emptyText: {
    fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary, textAlign: "center",
  },
  backupCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: Colors.surface, borderRadius: 12,
    padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  backupName: {
    fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.text, marginBottom: 2,
  },
  backupMeta: {
    fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary,
  },
  fileActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  downloadBtn: {
    backgroundColor: Colors.accent, borderRadius: 8,
    padding: 7, alignItems: "center", justifyContent: "center",
  },
  restoreBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: Colors.warning, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  restoreBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 12 },
  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", padding: 20,
  },
  modalBox: {
    backgroundColor: Colors.surface, borderRadius: 16, padding: 20, width: "100%", maxWidth: 400,
  },
  modalHeader: {
    flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12,
  },
  modalTitle: {
    fontFamily: "Inter_700Bold", fontSize: 17, color: Colors.text,
  },
  modalDesc: {
    fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary,
    lineHeight: 20, marginBottom: 16,
  },
  passwordInput: {
    backgroundColor: Colors.background, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: Colors.border,
    color: Colors.text, fontSize: 14, fontFamily: "Inter_400Regular",
    marginBottom: 12,
  },
  modalError: {
    color: Colors.error, fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 8,
  },
  modalActions: { flexDirection: "row", gap: 10 },
  cancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    backgroundColor: Colors.background, alignItems: "center",
    borderWidth: 1, borderColor: Colors.border,
  },
  cancelBtnText: { color: Colors.text, fontFamily: "Inter_600SemiBold", fontSize: 14 },
  confirmBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    backgroundColor: Colors.error, alignItems: "center",
  },
  confirmBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },
});
