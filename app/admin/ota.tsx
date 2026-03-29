import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  TextInput,
  Platform,
  Alert,
} from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { queryClient, apiRequest } from "@/lib/query-client";

interface OtaRelease {
  id: string;
  version: string;
  bundlePath: string | null;
  releaseNotes: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  status: "draft" | "scheduled" | "active" | "superseded";
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ApiErrorBody {
  message?: string;
}

interface CreateOtaBody {
  version: string;
  releaseNotes?: string;
  bundlePath?: string;
  publishNow?: boolean;
  scheduledAt?: string;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function StatusBadge({ status }: { status: OtaRelease["status"] }) {
  const config: Record<OtaRelease["status"], { label: string; color: string; bg: string }> = {
    active: { label: "Attivo", color: "#fff", bg: "#22c55e" },
    scheduled: { label: "Programmato", color: "#fff", bg: "#f59e0b" },
    draft: { label: "Bozza", color: Colors.text, bg: Colors.border },
    superseded: { label: "Sostituito", color: Colors.textSecondary, bg: Colors.background },
  };
  const cfg = config[status] ?? config.draft;
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

export default function OtaScreen() {
  const insets = useSafeAreaInsets();
  const [showModal, setShowModal] = useState(false);
  const [version, setVersion] = useState("");
  const [bundlePath, setBundlePath] = useState("");
  const [releaseNotes, setReleaseNotes] = useState("");
  const [publishMode, setPublishMode] = useState<"now" | "scheduled" | "draft">("draft");
  const [scheduledDate, setScheduledDate] = useState("");

  const { data: releases = [], isLoading } = useQuery<OtaRelease[]>({
    queryKey: ["/api/admin/ota"],
  });

  async function parseApiError(res: Response, fallback: string): Promise<Error> {
    try {
      const body = (await res.json()) as ApiErrorBody;
      return new Error(body.message || fallback);
    } catch {
      return new Error(fallback);
    }
  }

  const createMutation = useMutation({
    mutationFn: async (body: CreateOtaBody) => {
      const res = await apiRequest("POST", "/api/admin/ota", body);
      if (!res.ok) throw await parseApiError(res, "Errore creazione release");
      return res.json() as Promise<OtaRelease>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ota"] });
      setShowModal(false);
      resetForm();
    },
    onError: (err: Error) => {
      Alert.alert("Errore", err.message);
    },
  });

  const publishMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/admin/ota/${id}/publish`, {});
      if (!res.ok) throw await parseApiError(res, "Errore pubblicazione");
      return res.json() as Promise<OtaRelease>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ota"] });
    },
    onError: (err: Error) => {
      Alert.alert("Errore", err.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/admin/ota/${id}`, undefined);
      if (!res.ok) throw await parseApiError(res, "Errore eliminazione");
      return res.json() as Promise<{ message: string }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ota"] });
    },
    onError: (err: Error) => {
      Alert.alert("Errore", err.message);
    },
  });

  function resetForm() {
    setVersion("");
    setBundlePath("");
    setReleaseNotes("");
    setPublishMode("draft");
    setScheduledDate("");
  }

  function handleCreate() {
    if (!version.trim()) {
      Alert.alert("Errore", "Inserisci la versione");
      return;
    }
    if (publishMode === "scheduled" && !scheduledDate.trim()) {
      Alert.alert("Errore", "Inserisci la data di programmazione");
      return;
    }

    const body: CreateOtaBody = {
      version: version.trim(),
      bundlePath: bundlePath.trim() || undefined,
      releaseNotes: releaseNotes.trim() || undefined,
    };

    if (publishMode === "now") {
      body.publishNow = true;
    } else if (publishMode === "scheduled") {
      body.scheduledAt = new Date(scheduledDate).toISOString();
    }

    createMutation.mutate(body);
  }

  function confirmPublish(release: OtaRelease) {
    Alert.alert(
      "Pubblica ora",
      `Vuoi pubblicare la versione ${release.version} adesso? Questa diventerà la versione attiva per tutti gli utenti.`,
      [
        { text: "Annulla", style: "cancel" },
        { text: "Pubblica", style: "default", onPress: () => publishMutation.mutate(release.id) },
      ]
    );
  }

  function confirmDelete(release: OtaRelease) {
    Alert.alert(
      "Elimina release",
      `Eliminare la versione ${release.version}?`,
      [
        { text: "Annulla", style: "cancel" },
        { text: "Elimina", style: "destructive", onPress: () => deleteMutation.mutate(release.id) },
      ]
    );
  }

  const activeRelease = releases.find((r) => r.status === "active");

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : 0 }]}>
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}
        >
          {activeRelease && (
            <View style={styles.activeCard}>
              <View style={styles.activeCardHeader}>
                <MaterialCommunityIcons name="check-circle" size={20} color="#22c55e" />
                <Text style={styles.activeCardTitle}>Versione attiva</Text>
              </View>
              <Text style={styles.activeVersion}>{activeRelease.version}</Text>
              <Text style={styles.activeDate}>
                Pubblicata il {formatDate(activeRelease.publishedAt)}
              </Text>
              {activeRelease.releaseNotes ? (
                <Text style={styles.activeNotes}>{activeRelease.releaseNotes}</Text>
              ) : null}
            </View>
          )}

          <TouchableOpacity style={styles.addButton} onPress={() => setShowModal(true)}>
            <Ionicons name="add-circle-outline" size={20} color={Colors.primary} />
            <Text style={styles.addButtonText}>Nuova Release OTA</Text>
          </TouchableOpacity>

          {releases.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="update" size={48} color={Colors.border} />
              <Text style={styles.emptyText}>Nessuna release OTA</Text>
              <Text style={styles.emptySubtext}>
                Crea la prima release per iniziare gli aggiornamenti OTA
              </Text>
            </View>
          ) : (
            releases.map((release) => (
              <View key={release.id} style={styles.releaseCard}>
                <View style={styles.releaseHeader}>
                  <View>
                    <Text style={styles.releaseVersion}>v{release.version}</Text>
                    <Text style={styles.releaseDate}>
                      Creata: {formatDate(release.createdAt)}
                    </Text>
                    {release.scheduledAt && release.status === "scheduled" && (
                      <Text style={styles.scheduledLabel}>
                        Programmata: {formatDate(release.scheduledAt)}
                      </Text>
                    )}
                    {release.publishedAt && (
                      <Text style={styles.publishedDate}>
                        Pubblicata: {formatDate(release.publishedAt)}
                      </Text>
                    )}
                    {release.bundlePath ? (
                      <Text style={styles.bundlePathLabel} numberOfLines={1}>
                        Bundle: {release.bundlePath}
                      </Text>
                    ) : null}
                  </View>
                  <StatusBadge status={release.status} />
                </View>

                {release.releaseNotes ? (
                  <Text style={styles.releaseNotes}>{release.releaseNotes}</Text>
                ) : null}

                <View style={styles.releaseActions}>
                  {(release.status === "draft" || release.status === "scheduled") && (
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.publishBtn]}
                      onPress={() => confirmPublish(release)}
                      disabled={publishMutation.isPending}
                    >
                      <Ionicons name="cloud-upload-outline" size={16} color="#fff" />
                      <Text style={styles.publishBtnText}>Pubblica ora</Text>
                    </TouchableOpacity>
                  )}
                  {release.status !== "active" && (
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.deleteBtn]}
                      onPress={() => confirmDelete(release)}
                      disabled={deleteMutation.isPending}
                    >
                      <Ionicons name="trash-outline" size={16} color="#ef4444" />
                      <Text style={styles.deleteBtnText}>Elimina</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      <Modal
        visible={showModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setShowModal(false);
          resetForm();
        }}
      >
        <View style={[styles.modalContainer, { paddingTop: insets.top + 16 }]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={() => {
                setShowModal(false);
                resetForm();
              }}
            >
              <Text style={styles.modalCancel}>Annulla</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Nuova Release OTA</Text>
            <TouchableOpacity
              style={styles.modalSaveBtn}
              onPress={handleCreate}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.modalSave}>Crea</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
            <Text style={styles.fieldLabel}>Versione *</Text>
            <TextInput
              style={styles.input}
              value={version}
              onChangeText={setVersion}
              placeholder="es. 1.2.3"
              placeholderTextColor={Colors.textSecondary}
            />

            <Text style={styles.fieldLabel}>Bundle URL</Text>
            <TextInput
              style={styles.input}
              value={bundlePath}
              onChangeText={setBundlePath}
              placeholder="URL del bundle JS (es. https://.../_expo/static/js/android/bundle.js)"
              placeholderTextColor={Colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.fieldHint}>
              URL completo del file bundle JavaScript. Se vuoto, il manifest
              continuerà a usare il bundle predefinito.
            </Text>

            <Text style={styles.fieldLabel}>Note di rilascio</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={releaseNotes}
              onChangeText={setReleaseNotes}
              placeholder="Descrivi le novità di questa versione..."
              placeholderTextColor={Colors.textSecondary}
              multiline
              numberOfLines={4}
            />

            <Text style={styles.fieldLabel}>Modalità di pubblicazione</Text>
            <View style={styles.modeSelector}>
              {(["draft", "now", "scheduled"] as const).map((mode) => {
                const labels = { draft: "Salva come bozza", now: "Pubblica subito", scheduled: "Programma" };
                return (
                  <TouchableOpacity
                    key={mode}
                    style={[styles.modeBtn, publishMode === mode && styles.modeBtnActive]}
                    onPress={() => setPublishMode(mode)}
                  >
                    <Text
                      style={[
                        styles.modeBtnText,
                        publishMode === mode && styles.modeBtnTextActive,
                      ]}
                    >
                      {labels[mode]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {publishMode === "scheduled" && (
              <>
                <Text style={styles.fieldLabel}>Data e ora (formato ISO)</Text>
                <TextInput
                  style={styles.input}
                  value={scheduledDate}
                  onChangeText={setScheduledDate}
                  placeholder="es. 2026-04-01T10:00:00"
                  placeholderTextColor={Colors.textSecondary}
                />
                <Text style={styles.fieldHint}>
                  Inserisci nel formato ISO 8601, ad esempio: 2026-04-01T10:00:00
                </Text>
              </>
            )}

            {publishMode === "now" && (
              <View style={styles.warningBox}>
                <Ionicons name="warning-outline" size={16} color="#f59e0b" />
                <Text style={styles.warningText}>
                  La release verrà pubblicata immediatamente e diventerà la versione attiva per
                  tutti gli utenti.
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.createBtn, createMutation.isPending && { opacity: 0.6 }]}
              onPress={handleCreate}
              disabled={createMutation.isPending}
              activeOpacity={0.8}
            >
              {createMutation.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.createBtnText}>Crea release</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: 16,
  },
  activeCard: {
    backgroundColor: "#dcfce7",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#86efac",
  },
  activeCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  activeCardTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "#166534",
  },
  activeVersion: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: "#15803d",
  },
  activeDate: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: "#166534",
    marginTop: 2,
  },
  activeNotes: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: "#166534",
    marginTop: 6,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: "center",
  },
  addButtonText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.primary,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 18,
    color: Colors.text,
  },
  emptySubtext: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    paddingHorizontal: 32,
  },
  releaseCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  releaseHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  releaseVersion: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: Colors.text,
  },
  releaseDate: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  scheduledLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: "#f59e0b",
    marginTop: 2,
  },
  publishedDate: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  bundlePathLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
    opacity: 0.7,
  },
  releaseNotes: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 12,
    lineHeight: 18,
  },
  releaseActions: {
    flexDirection: "row",
    gap: 8,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  publishBtn: {
    backgroundColor: Colors.primary,
  },
  publishBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: "#fff",
  },
  deleteBtn: {
    borderWidth: 1,
    borderColor: "#fca5a5",
    backgroundColor: "#fff5f5",
  },
  deleteBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: "#ef4444",
  },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalCancel: {
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    color: Colors.textSecondary,
  },
  modalTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
    color: Colors.text,
  },
  modalSaveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    minWidth: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  modalSave: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: "#fff",
  },
  createBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
  createBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: "#fff",
  },
  modalBody: {
    padding: 16,
  },
  fieldLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
    marginBottom: 6,
    marginTop: 16,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: Colors.text,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  modeSelector: {
    flexDirection: "column",
    gap: 8,
  },
  modeBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    backgroundColor: Colors.surface,
  },
  modeBtnActive: {
    borderColor: Colors.primary,
    backgroundColor: `${Colors.primary}15`,
  },
  modeBtnText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  modeBtnTextActive: {
    color: Colors.primary,
    fontFamily: "Inter_600SemiBold",
  },
  fieldHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  warningBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#fffbeb",
    borderRadius: 10,
    padding: 12,
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#fde68a",
  },
  warningText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: "#92400e",
    flex: 1,
    lineHeight: 18,
  },
});
