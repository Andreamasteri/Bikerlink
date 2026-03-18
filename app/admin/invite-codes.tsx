import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  Switch,
  Platform,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import Colors from "@/constants/colors";
import { apiRequest, getApiUrl } from "@/lib/query-client";

type InvitationCode = {
  id: string;
  code: string;
  label: string | null;
  giftMessage: string | null;
  maxUses: number;
  currentUses: number;
  isActive: boolean;
  expiresAt: string | null;
  imageUrl: string | null;
  createdAt: string;
};

type PendingImage = {
  uri: string;
  name: string;
  type: string;
};

type StatsPerCode = {
  code: string;
  label: string;
  count: number;
  isActive: boolean;
  currentUses: number;
  maxUses: number;
};

type Stats = {
  totalUsers: number;
  usersWithCode: number;
  perCode: StatsPerCode[];
};

const EMPTY_FORM = { code: "", label: "", giftMessage: "", maxUses: "100", expiresAt: "" };

export default function InviteCodesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCode, setEditingCode] = useState<InvitationCode | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const { data: stats, isLoading: statsLoading } = useQuery<Stats>({
    queryKey: ["/api/admin/invitation-codes/stats"],
  });

  const { data: codes = [], isLoading: codesLoading } = useQuery<InvitationCode[]>({
    queryKey: ["/api/admin/invitation-codes"],
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/admin/invitation-codes"] });
    qc.invalidateQueries({ queryKey: ["/api/admin/invitation-codes/stats"] });
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.9,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const name = asset.fileName ?? `gadget_${Date.now()}.jpg`;
      const type = asset.mimeType ?? "image/jpeg";
      setPendingImage({ uri: asset.uri, name, type });
    }
  };

  const uploadImageForCode = async (codeId: string, img: PendingImage) => {
    setIsUploadingImage(true);
    try {
      const baseUrl = getApiUrl();
      const url = new URL(`/api/admin/invitation-codes/${codeId}/image`, baseUrl);
      const formData = new FormData();
      formData.append("image", { uri: img.uri, name: img.name, type: img.type } as unknown as Blob);
      const res = await globalThis.fetch(url.toString(), {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text();
        console.warn("[UPLOAD] Errore upload immagine:", text);
      }
    } catch (err) {
      console.warn("[UPLOAD] Errore upload immagine:", err);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const createMutation = useMutation({
    mutationFn: (data: typeof EMPTY_FORM) =>
      apiRequest("POST", "/api/admin/invitation-codes", {
        code: data.code.trim().toUpperCase(),
        label: data.label.trim() || null,
        giftMessage: data.giftMessage.trim() || null,
        maxUses: parseInt(data.maxUses, 10) || 100,
        expiresAt: data.expiresAt || null,
      }),
    onSuccess: async (res: Response) => {
      const created: InvitationCode = await res.json().catch(() => null) as InvitationCode;
      if (created?.id && pendingImage) {
        await uploadImageForCode(created.id, pendingImage);
      }
      invalidate();
      setShowCreateModal(false);
      setForm(EMPTY_FORM);
      setFormError("");
      setPendingImage(null);
    },
    onError: (err: any) => {
      const msg = err?.message || "Errore nella creazione";
      try { setFormError(JSON.parse(msg.replace(/^\d+:\s*/, "")).message); } catch { setFormError(msg); }
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<InvitationCode> }) =>
      apiRequest("PUT", `/api/admin/invitation-codes/${id}`, data),
    onSuccess: async (_res: Response, variables: { id: string; data: Partial<InvitationCode> }) => {
      if (pendingImage) {
        await uploadImageForCode(variables.id, pendingImage);
      }
      invalidate();
      setEditingCode(null);
      setForm(EMPTY_FORM);
      setFormError("");
      setPendingImage(null);
    },
    onError: (err: any) => {
      const msg = err?.message || "Errore nell'aggiornamento";
      try { setFormError(JSON.parse(msg.replace(/^\d+:\s*/, "")).message); } catch { setFormError(msg); }
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest("PUT", `/api/admin/invitation-codes/${id}`, { isActive }),
    onSuccess: () => invalidate(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/invitation-codes/${id}`),
    onSuccess: () => { invalidate(); setConfirmDeleteId(null); },
  });

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormError("");
    setEditingCode(null);
    setPendingImage(null);
    setShowCreateModal(true);
  };

  const openEdit = (c: InvitationCode) => {
    setForm({
      code: c.code,
      label: c.label ?? "",
      giftMessage: c.giftMessage ?? "",
      maxUses: String(c.maxUses),
      expiresAt: c.expiresAt ? c.expiresAt.split("T")[0] : "",
    });
    setFormError("");
    setEditingCode(c);
    setPendingImage(null);
    setShowCreateModal(true);
  };

  const handleSave = () => {
    if (!editingCode && !form.code.trim()) {
      setFormError("Inserisci il codice");
      return;
    }
    if (editingCode) {
      updateMutation.mutate({
        id: editingCode.id,
        data: {
          label: form.label.trim() || null,
          giftMessage: form.giftMessage.trim() || null,
          maxUses: parseInt(form.maxUses, 10) || 100,
          expiresAt: form.expiresAt || null,
        },
      });
    } else {
      createMutation.mutate(form);
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending || isUploadingImage;

  const activeCount = codes.filter((c) => c.isActive).length;

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Codici Invito</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openCreate}>
          <Ionicons name="add" size={26} color={Colors.background} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>

        {/* Counters */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {statsLoading ? "–" : stats?.totalUsers ?? 0}
            </Text>
            <Text style={styles.statLabel}>Utenti totali</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: Colors.accent }]}>
              {statsLoading ? "–" : stats?.usersWithCode ?? 0}
            </Text>
            <Text style={styles.statLabel}>Con codice</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: "#4CAF50" }]}>
              {codesLoading ? "–" : activeCount}
            </Text>
            <Text style={styles.statLabel}>Codici attivi</Text>
          </View>
        </View>

        {/* Per-code counters */}
        {stats && stats.perCode.length > 0 && (
          <View style={styles.perCodeSection}>
            <Text style={styles.sectionTitle}>Utilizzi per codice</Text>
            {stats.perCode.map((pc) => (
              <View key={pc.code} style={styles.perCodeRow}>
                <View style={styles.perCodeInfo}>
                  <Text style={styles.perCodeName}>{pc.label || pc.code}</Text>
                  <Text style={styles.perCodeCode}>{pc.code}</Text>
                </View>
                <View style={styles.perCodeRight}>
                  <Text style={[styles.perCodeCount, { color: pc.isActive ? Colors.accent : Colors.textSecondary }]}>
                    {pc.count}
                  </Text>
                  <Text style={styles.perCodeUses}>{pc.currentUses}/{pc.maxUses} usi</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Codes list */}
        <Text style={styles.sectionTitle}>Tutti i codici</Text>
        {codesLoading && <ActivityIndicator color={Colors.accent} style={{ marginTop: 20 }} />}
        {!codesLoading && codes.length === 0 && (
          <Text style={styles.emptyText}>Nessun codice. Premi + per crearne uno.</Text>
        )}
        {codes.map((c) => (
          <View key={c.id} style={[styles.codeCard, !c.isActive && styles.codeCardInactive]}>
            <View style={styles.codeCardHeader}>
              {c.imageUrl ? (
                <Image
                  source={{ uri: `${getApiUrl().replace(/\/$/, "")}${c.imageUrl}` }}
                  style={styles.cardThumbnail}
                  resizeMode="cover"
                />
              ) : null}
              <View style={{ flex: 1 }}>
                <Text style={styles.codeText}>{c.code}</Text>
                {c.label && <Text style={styles.codeLabelText}>{c.label}</Text>}
              </View>
              <Switch
                value={c.isActive}
                onValueChange={(v) => toggleMutation.mutate({ id: c.id, isActive: v })}
                trackColor={{ false: Colors.border, true: Colors.accent }}
                thumbColor={Colors.background}
              />
            </View>

            {c.giftMessage && (
              <View style={styles.giftRow}>
                <Ionicons name="gift-outline" size={14} color={Colors.accent} />
                <Text style={styles.giftText} numberOfLines={2}>{c.giftMessage}</Text>
              </View>
            )}

            <View style={styles.codeCardFooter}>
              <View style={styles.usesBar}>
                <View
                  style={[
                    styles.usesBarFill,
                    { width: `${Math.min(100, (c.currentUses / c.maxUses) * 100)}%` },
                  ]}
                />
              </View>
              <Text style={styles.usesText}>{c.currentUses}/{c.maxUses} usi</Text>
              {c.expiresAt && (
                <Text style={styles.expiresText}>
                  Scade: {new Date(c.expiresAt).toLocaleDateString("it-IT")}
                </Text>
              )}
            </View>

            <View style={styles.codeActions}>
              <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(c)}>
                <Ionicons name="pencil" size={16} color={Colors.accent} />
                <Text style={styles.editBtnText}>Modifica</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteBtn} onPress={() => setConfirmDeleteId(c.id)}>
                <Ionicons name="trash-outline" size={16} color={Colors.error} />
                <Text style={styles.deleteBtnText}>Elimina</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Create/Edit Modal */}
      <Modal visible={showCreateModal} transparent animationType="slide" onRequestClose={() => setShowCreateModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingCode ? "Modifica codice" : "Nuovo codice"}</Text>
              <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled">
              {!editingCode && (
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Codice *</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={form.code}
                    onChangeText={(v) => setForm({ ...form, code: v.toUpperCase() })}
                    placeholder="Es. SMILE"
                    placeholderTextColor={Colors.textSecondary}
                    autoCapitalize="characters"
                    autoCorrect={false}
                  />
                  <Text style={styles.fieldHint}>Il codice che verrà inserito dagli utenti al momento della registrazione</Text>
                </View>
              )}

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Nome / Esercente</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={form.label}
                  onChangeText={(v) => setForm({ ...form, label: v })}
                  placeholder="Es. Pub Rock Roma"
                  placeholderTextColor={Colors.textSecondary}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Messaggio omaggio</Text>
                <TextInput
                  style={[styles.fieldInput, styles.fieldTextarea]}
                  value={form.giftMessage}
                  onChangeText={(v) => setForm({ ...form, giftMessage: v })}
                  placeholder={"Es. Grazie per esserti registrato!\nMostra questo schermo al barista per ritirare il tuo drink di benvenuto."}
                  placeholderTextColor={Colors.textSecondary}
                  multiline
                  numberOfLines={4}
                />
                <Text style={styles.fieldHint}>Verrà mostrato all'utente dopo la registrazione con questo codice</Text>
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Immagine gadget</Text>
                <TouchableOpacity style={styles.imagePickerBtn} onPress={pickImage}>
                  <Ionicons name="image-outline" size={20} color={Colors.accent} />
                  <Text style={styles.imagePickerBtnText}>
                    {pendingImage ? "Cambia immagine" : (editingCode?.imageUrl ? "Sostituisci immagine" : "Carica immagine")}
                  </Text>
                </TouchableOpacity>
                <Text style={styles.fieldHint}>Formati supportati: JPG e PNG — max 5 MB</Text>
                {pendingImage ? (
                  <View style={styles.imagePreviewRow}>
                    <Image source={{ uri: pendingImage.uri }} style={styles.imagePreview} resizeMode="cover" />
                    <TouchableOpacity onPress={() => setPendingImage(null)} style={styles.imageRemoveBtn}>
                      <Ionicons name="close-circle" size={20} color={Colors.error} />
                    </TouchableOpacity>
                  </View>
                ) : editingCode?.imageUrl ? (
                  <View style={styles.imagePreviewRow}>
                    <Image
                      source={{ uri: `${getApiUrl().replace(/\/$/, "")}${editingCode.imageUrl}` }}
                      style={styles.imagePreview}
                      resizeMode="cover"
                    />
                    <Text style={styles.imageExistingLabel}>Immagine attuale</Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Numero massimo di usi</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={form.maxUses}
                  onChangeText={(v) => setForm({ ...form, maxUses: v })}
                  keyboardType="number-pad"
                  placeholder="100"
                  placeholderTextColor={Colors.textSecondary}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Scadenza (opzionale, formato YYYY-MM-DD)</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={form.expiresAt}
                  onChangeText={(v) => setForm({ ...form, expiresAt: v })}
                  placeholder="2026-12-31"
                  placeholderTextColor={Colors.textSecondary}
                  keyboardType="numbers-and-punctuation"
                />
              </View>

              {formError ? <Text style={styles.formError}>{formError}</Text> : null}

              <TouchableOpacity
                style={[styles.saveBtn, isSaving && { opacity: 0.7 }]}
                onPress={handleSave}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator color={Colors.background} />
                ) : (
                  <Text style={styles.saveBtnText}>{editingCode ? "Salva modifiche" : "Crea codice"}</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Confirm Delete */}
      <Modal visible={!!confirmDeleteId} transparent animationType="fade" onRequestClose={() => setConfirmDeleteId(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { padding: 28 }]}>
            <Ionicons name="warning" size={40} color={Colors.error} style={{ alignSelf: "center", marginBottom: 12 }} />
            <Text style={[styles.modalTitle, { textAlign: "center", marginBottom: 8 }]}>Eliminare il codice?</Text>
            <Text style={styles.confirmText}>Questa azione non può essere annullata.</Text>
            <View style={styles.confirmBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setConfirmDeleteId(null)}>
                <Text style={styles.cancelBtnText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmDeleteBtn, deleteMutation.isPending && { opacity: 0.7 }]}
                onPress={() => confirmDeleteId && deleteMutation.mutate(confirmDeleteId)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? (
                  <ActivityIndicator color={Colors.background} size="small" />
                ) : (
                  <Text style={styles.confirmDeleteText}>Elimina</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    padding: 4,
    marginRight: 12,
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  addBtn: {
    backgroundColor: Colors.accent,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: 16,
    gap: 16,
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    gap: 4,
  },
  statValue: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
    textAlign: "center",
  },
  perCodeSection: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  perCodeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  perCodeInfo: {
    flex: 1,
  },
  perCodeName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  perCodeCode: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  perCodeRight: {
    alignItems: "flex-end",
  },
  perCodeCount: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  perCodeUses: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  codeCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  codeCardInactive: {
    opacity: 0.55,
  },
  codeCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  codeText: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.accent,
    letterSpacing: 2,
  },
  codeLabelText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  giftRow: {
    flexDirection: "row",
    gap: 6,
    alignItems: "flex-start",
  },
  giftText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    lineHeight: 18,
  },
  codeCardFooter: {
    gap: 4,
  },
  usesBar: {
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    overflow: "hidden",
  },
  usesBarFill: {
    height: 4,
    backgroundColor: Colors.accent,
    borderRadius: 2,
  },
  usesText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  expiresText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  codeActions: {
    flexDirection: "row",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 10,
  },
  editBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(255,152,0,0.1)",
    borderRadius: 8,
    paddingVertical: 8,
  },
  editBtnText: {
    color: Colors.accent,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  deleteBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(229,57,53,0.1)",
    borderRadius: 8,
    paddingVertical: 8,
  },
  deleteBtnText: {
    color: Colors.error,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  emptyText: {
    textAlign: "center",
    color: Colors.textSecondary,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginTop: 32,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    flex: 1,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  field: {
    gap: 6,
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
  },
  fieldInput: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  fieldTextarea: {
    minHeight: 90,
    textAlignVertical: "top",
  },
  fieldHint: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    lineHeight: 15,
  },
  formError: {
    color: Colors.error,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginBottom: 12,
    textAlign: "center",
  },
  saveBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 12,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    marginBottom: 20,
  },
  saveBtnText: {
    color: Colors.background,
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  confirmText: {
    textAlign: "center",
    color: Colors.textSecondary,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginBottom: 24,
  },
  confirmBtns: {
    flexDirection: "row",
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    color: Colors.text,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  confirmDeleteBtn: {
    flex: 1,
    backgroundColor: Colors.error,
    borderRadius: 10,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmDeleteText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  imagePickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,107,53,0.1)",
    borderWidth: 1,
    borderColor: Colors.accent,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  imagePickerBtnText: {
    color: Colors.accent,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  imagePreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 8,
  },
  imagePreview: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: Colors.border,
  },
  imageRemoveBtn: {
    padding: 4,
  },
  imageExistingLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  cardThumbnail: {
    width: 44,
    height: 44,
    borderRadius: 6,
    marginRight: 8,
    backgroundColor: Colors.border,
  },
});
