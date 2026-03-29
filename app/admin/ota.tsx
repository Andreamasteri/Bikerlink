import React, { useState, useEffect } from "react";
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
import Constants from "expo-constants";
import * as Updates from "expo-updates";
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

function getRunningOtaLabel(): string {
  try {
    if (__DEV__) return "Modalità sviluppo";
    const uid = Updates.updateId;
    if (!uid) return "Bundle originale";
    return uid.substring(0, 8);
  } catch {
    return "—";
  }
}

function getAppVersion(): string {
  return Constants.expoConfig?.version ?? "—";
}

export default function OtaScreen() {
  const insets = useSafeAreaInsets();
  const [showModal, setShowModal] = useState(false);
  const [version, setVersion] = useState("");
  const [releaseNotes, setReleaseNotes] = useState("");

  const [checkLoading, setCheckLoading] = useState(true);
  const [otaAvailable, setOtaAvailable] = useState<boolean | null>(null);
  const [isForcing, setIsForcing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        if (__DEV__ || Platform.OS === "web") {
          setOtaAvailable(false);
          setCheckLoading(false);
          return;
        }
        const result = await Updates.checkForUpdateAsync();
        setOtaAvailable(result.isAvailable);
      } catch {
        setOtaAvailable(false);
      } finally {
        setCheckLoading(false);
      }
    })();
  }, []);

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
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/ota", {
        version: version.trim(),
        releaseNotes: releaseNotes.trim() || undefined,
        publishNow: true,
      });
      if (!res.ok) throw await parseApiError(res, "Errore creazione release");
      return res.json() as Promise<OtaRelease>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ota"] });
      setShowModal(false);
      setVersion("");
      setReleaseNotes("");
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/ota"] }),
    onError: (err: Error) => Alert.alert("Errore", err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/admin/ota/${id}`, undefined);
      if (!res.ok) throw await parseApiError(res, "Errore eliminazione");
      return res.json() as Promise<{ message: string }>;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/ota"] }),
    onError: (err: Error) => Alert.alert("Errore", err.message),
  });

  const deactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/admin/ota/${id}/deactivate`, undefined);
      if (!res.ok) throw await parseApiError(res, "Errore disattivazione");
      return res.json() as Promise<OtaRelease>;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/ota"] }),
    onError: (err: Error) => Alert.alert("Errore", err.message),
  });

  async function handleForceUpdate() {
    setIsForcing(true);
    try {
      try {
        await Updates.fetchUpdateAsync();
      } catch {}
      await Updates.reloadAsync();
    } catch {
      setIsForcing(false);
      Alert.alert("Errore", "Impossibile applicare l'aggiornamento. Riprova.");
    }
  }

  function confirmPublish(release: OtaRelease) {
    Alert.alert(
      "Pubblica ora",
      `Vuoi pubblicare la versione ${release.version} adesso?`,
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

  function confirmDeactivate(release: OtaRelease) {
    Alert.alert(
      "Disattiva release",
      `Disattivare la versione ${release.version}? Gli utenti non vedranno più il modal di aggiornamento.`,
      [
        { text: "Annulla", style: "cancel" },
        { text: "Disattiva", style: "default", onPress: () => deactivateMutation.mutate(release.id) },
      ]
    );
  }

  const activeRelease = releases.find((r) => r.status === "active") ?? null;
  const supersededReleases = releases
    .filter((r) => r.status === "superseded")
    .sort((a, b) => new Date(b.publishedAt ?? b.createdAt).getTime() - new Date(a.publishedAt ?? a.createdAt).getTime());
  const pendingReleases = releases.filter((r) => r.status === "draft" || r.status === "scheduled");

  const runningOta = getRunningOtaLabel();
  const appVersion = getAppVersion();

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : 0 }]}>
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 90 }]}
        >
          <View style={styles.deviceCard}>
            <View style={styles.deviceRow}>
              <MaterialCommunityIcons name="cellphone" size={18} color={Colors.textSecondary} />
              <Text style={styles.deviceLabel}>Versione app</Text>
              <Text style={styles.deviceValue}>{appVersion}</Text>
            </View>
            <View style={styles.deviceDivider} />
            <View style={styles.deviceRow}>
              <MaterialCommunityIcons name="cloud-download-outline" size={18} color={Colors.textSecondary} />
              <Text style={styles.deviceLabel}>OTA in esecuzione</Text>
              <Text style={styles.deviceValue}>{runningOta}</Text>
            </View>
          </View>

          {checkLoading ? (
            <View style={styles.updateBannerLoading}>
              <ActivityIndicator size="small" color={Colors.textSecondary} />
              <Text style={styles.updateBannerLoadingText}>Controllo aggiornamenti EAS...</Text>
            </View>
          ) : otaAvailable ? (
            <View style={styles.updateBannerAvailable}>
              <View style={styles.updateBannerRow}>
                <MaterialCommunityIcons name="arrow-down-circle" size={22} color="#22c55e" />
                <View style={styles.updateBannerTexts}>
                  <Text style={styles.updateBannerTitle}>Aggiornamento EAS disponibile</Text>
                  <Text style={styles.updateBannerSub}>Premi per scaricare e applicare ora</Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.forceBtn, isForcing && { opacity: 0.6 }]}
                onPress={handleForceUpdate}
                disabled={isForcing}
                activeOpacity={0.8}
              >
                {isForcing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <MaterialCommunityIcons name="update" size={18} color="#fff" />
                )}
                <Text style={styles.forceBtnText}>
                  {isForcing ? "Applicazione in corso..." : "Forza aggiornamento"}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.updateBannerOk}>
              <Ionicons name="checkmark-circle-outline" size={16} color={Colors.textSecondary} />
              <Text style={styles.updateBannerOkText}>App aggiornata</Text>
            </View>
          )}

          {activeRelease && (
            <>
              <Text style={styles.sectionTitle}>Versione notificata agli utenti</Text>
              <View style={styles.activeCard}>
                <View style={styles.activeCardHeader}>
                  <MaterialCommunityIcons name="check-circle" size={20} color="#22c55e" />
                  <Text style={styles.activeVersion}>v{activeRelease.version}</Text>
                  <TouchableOpacity
                    style={styles.deactivateBtn}
                    onPress={() => confirmDeactivate(activeRelease)}
                    disabled={deactivateMutation.isPending}
                  >
                    {deactivateMutation.isPending ? (
                      <ActivityIndicator size="small" color="#f97316" />
                    ) : (
                      <>
                        <Ionicons name="pause-circle-outline" size={16} color="#f97316" />
                        <Text style={styles.deactivateBtnText}>Disattiva</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
                <Text style={styles.activeDate}>
                  Pubblicata il {formatDate(activeRelease.publishedAt)}
                </Text>
                {activeRelease.releaseNotes ? (
                  <Text style={styles.activeNotes}>{activeRelease.releaseNotes}</Text>
                ) : null}
              </View>
            </>
          )}

          {pendingReleases.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>In attesa di pubblicazione</Text>
              {pendingReleases.map((release) => (
                <View key={release.id} style={styles.pendingCard}>
                  <View style={styles.releaseHeaderRow}>
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
                    </View>
                    <View style={styles.pendingBadge}>
                      <Text style={styles.pendingBadgeText}>
                        {release.status === "scheduled" ? "Programmata" : "Bozza"}
                      </Text>
                    </View>
                  </View>
                  {release.releaseNotes ? (
                    <Text style={styles.releaseNotes}>{release.releaseNotes}</Text>
                  ) : null}
                  <View style={styles.releaseActions}>
                    <TouchableOpacity
                      style={styles.publishBtn}
                      onPress={() => confirmPublish(release)}
                      disabled={publishMutation.isPending}
                    >
                      <Ionicons name="cloud-upload-outline" size={15} color="#fff" />
                      <Text style={styles.publishBtnText}>Pubblica ora</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.deleteBtn}
                      onPress={() => confirmDelete(release)}
                      disabled={deleteMutation.isPending}
                    >
                      <Ionicons name="trash-outline" size={15} color="#ef4444" />
                      <Text style={styles.deleteBtnText}>Elimina</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </>
          )}

          {supersededReleases.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Storico aggiornamenti</Text>
              {supersededReleases.map((release) => (
                <View key={release.id} style={styles.historyCard}>
                  <View style={styles.releaseHeaderRow}>
                    <View style={styles.historyLeft}>
                      <Text style={styles.historyVersion}>v{release.version}</Text>
                      {release.publishedAt && (
                        <Text style={styles.historyDate}>{formatDate(release.publishedAt)}</Text>
                      )}
                    </View>
                    <View style={styles.supersededBadge}>
                      <Text style={styles.supersededBadgeText}>Sostituita</Text>
                    </View>
                  </View>
                  {release.releaseNotes ? (
                    <Text style={styles.historyNotes}>{release.releaseNotes}</Text>
                  ) : null}
                </View>
              ))}
            </>
          )}

          {releases.length === 0 && (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="update" size={48} color={Colors.border} />
              <Text style={styles.emptyText}>Nessuna release OTA</Text>
              <Text style={styles.emptySubtext}>
                Premi + per creare la prima release
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 20 }]}
        onPress={() => setShowModal(true)}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      <Modal
        visible={showModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setShowModal(false);
          setVersion("");
          setReleaseNotes("");
        }}
      >
        <View style={[styles.modalContainer, { paddingTop: insets.top + 16 }]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={() => {
                setShowModal(false);
                setVersion("");
                setReleaseNotes("");
              }}
            >
              <Text style={styles.modalCancel}>Annulla</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Nuova Release OTA</Text>
            <TouchableOpacity
              style={[styles.modalSaveBtn, (!version.trim() || createMutation.isPending) && { opacity: 0.5 }]}
              onPress={() => {
                if (!version.trim()) {
                  Alert.alert("Errore", "Inserisci la versione");
                  return;
                }
                createMutation.mutate();
              }}
              disabled={!version.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.modalSave}>Pubblica</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
            <View style={styles.modalWarning}>
              <Ionicons name="information-circle-outline" size={16} color={Colors.accent} />
              <Text style={styles.modalWarningText}>
                La release verrà pubblicata immediatamente e notificata agli utenti.
              </Text>
            </View>

            <Text style={styles.fieldLabel}>Versione *</Text>
            <TextInput
              style={styles.input}
              value={version}
              onChangeText={setVersion}
              placeholder="es. 1.2.0"
              placeholderTextColor={Colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
            />

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

            <TouchableOpacity
              style={[styles.createBtn, (!version.trim() || createMutation.isPending) && { opacity: 0.5 }]}
              onPress={() => {
                if (!version.trim()) {
                  Alert.alert("Errore", "Inserisci la versione");
                  return;
                }
                createMutation.mutate();
              }}
              disabled={!version.trim() || createMutation.isPending}
              activeOpacity={0.8}
            >
              {createMutation.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.createBtnText}>Pubblica ora</Text>
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
    gap: 0,
  },

  deviceCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  deviceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
  },
  deviceDivider: {
    height: 1,
    backgroundColor: Colors.border,
  },
  deviceLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    flex: 1,
  },
  deviceValue: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },

  updateBannerLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  updateBannerLoadingText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  updateBannerAvailable: {
    backgroundColor: "#052e16",
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#16a34a",
    gap: 12,
  },
  updateBannerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  updateBannerTexts: {
    flex: 1,
  },
  updateBannerTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "#4ade80",
  },
  updateBannerSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: "#86efac",
    marginTop: 2,
  },
  forceBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#16a34a",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  forceBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: "#fff",
  },
  updateBannerOk: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    alignSelf: "flex-start",
  },
  updateBannerOkText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
  },

  sectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 16,
    marginBottom: 10,
  },

  activeCard: {
    backgroundColor: "#052e16",
    borderRadius: 14,
    padding: 16,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "#16a34a",
  },
  activeCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  activeVersion: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: "#4ade80",
    flex: 1,
  },
  activeDate: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: "#86efac",
    marginTop: 2,
  },
  activeNotes: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: "#86efac",
    marginTop: 8,
    lineHeight: 18,
  },
  deactivateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#f97316",
    backgroundColor: "#1c0a00",
  },
  deactivateBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: "#f97316",
  },

  pendingCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#f59e0b44",
  },
  historyCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  releaseHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  historyLeft: {
    flex: 1,
  },
  releaseVersion: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
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
  releaseNotes: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 10,
    lineHeight: 18,
  },
  historyVersion: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.textSecondary,
  },
  historyDate: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
    opacity: 0.7,
  },
  historyNotes: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
    lineHeight: 18,
    opacity: 0.8,
  },
  pendingBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "#451a03",
    borderWidth: 1,
    borderColor: "#f59e0b55",
  },
  pendingBadgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: "#f59e0b",
  },
  supersededBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  supersededBadgeText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  releaseActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  publishBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: Colors.primary,
  },
  publishBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: "#fff",
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fca5a544",
    backgroundColor: "#1a0000",
  },
  deleteBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: "#ef4444",
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

  fab: {
    position: "absolute",
    right: 20,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 8,
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
    backgroundColor: Colors.accent,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    minWidth: 70,
    alignItems: "center",
    justifyContent: "center",
  },
  modalSave: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: "#fff",
  },
  modalBody: {
    padding: 16,
  },
  modalWarning: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#1c0900",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: `${Colors.accent}44`,
  },
  modalWarningText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.accent,
    flex: 1,
    lineHeight: 18,
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
    minHeight: 90,
    textAlignVertical: "top",
  },
  createBtn: {
    backgroundColor: Colors.accent,
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
});
