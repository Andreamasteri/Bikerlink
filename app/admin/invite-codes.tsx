import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import Colors from "@/constants/colors";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { useT } from "@/lib/language-context";

import { InviteCodeCard, InvitationCode } from "@/components/admin/invite-codes/InviteCodeCard";
import { InviteCodeStats, Stats } from "@/components/admin/invite-codes/InviteCodeStats";
import { InviteCodeForm, EMPTY_FORM, PendingImage } from "@/components/admin/invite-codes/InviteCodeForm";
import { InviteCodeFilters } from "@/components/admin/invite-codes/InviteCodeFilters";

export default function InviteCodesScreen() {
  const t = useT();
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

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [showActiveOnly, setShowActiveOnly] = useState(false);

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- error shape from API
    onError: (err: any) => {
      const msg = err?.message || t("admin.createError2");
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
      setShowCreateModal(false);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- error shape from API
    onError: (err: any) => {
      const msg = err?.message || t("admin.updateError");
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
      setFormError(t("admin.insertCode"));
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

  const filteredCodes = codes.filter((c) => {
    const query = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !query ||
      c.code.toLowerCase().includes(query) ||
      (c.label && c.label.toLowerCase().includes(query));
    const matchesActive = !showActiveOnly || c.isActive;
    return matchesSearch && matchesActive;
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
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
        <InviteCodeStats 
          stats={stats} 
          loading={statsLoading} 
          activeCount={activeCount} 
          codesLoading={codesLoading} 
        />

        <View style={{ marginTop: 24 }}>
          <Text style={styles.sectionTitle}>Tutti i codici</Text>
          <InviteCodeFilters
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            showActiveOnly={showActiveOnly}
            setShowActiveOnly={setShowActiveOnly}
            t={t}
          />
        </View>

        {codesLoading && <ActivityIndicator color={Colors.accent} style={{ marginTop: 20 }} />}
        {!codesLoading && filteredCodes.length === 0 && (
          <Text style={styles.emptyText}>
            {codes.length === 0 ? "Nessun codice. Premi + per crearne uno." : "Nessun risultato per i filtri selezionati."}
          </Text>
        )}
        {filteredCodes.map((c) => (
          <InviteCodeCard
            key={c.id}
            code={c}
            onToggle={(id, isActive) => toggleMutation.mutate({ id, isActive })}
            onEdit={openEdit}
            onDelete={setConfirmDeleteId}
          />
        ))}
      </ScrollView>

      <InviteCodeForm
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        editingCode={editingCode}
        form={form}
        setForm={setForm}
        formError={formError}
        isSaving={isSaving}
        onSave={handleSave}
        onPickImage={pickImage}
        pendingImage={pendingImage}
        setPendingImage={setPendingImage}
        t={t}
      />

      {/* Confirm Delete */}
      <Modal visible={!!confirmDeleteId} transparent animationType="fade" onRequestClose={() => setConfirmDeleteId(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { padding: 28 }]}>
            <Ionicons name="warning" size={40} color={Colors.error} style={{ alignSelf: "center", marginBottom: 12 }} />
            <Text style={[styles.modalTitle, { textAlign: "center", marginBottom: 8 }]}>Eliminare il codice?</Text>
            <Text style={styles.confirmText}>{t("common.cannotBeUndone")}</Text>
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
  sectionTitle: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 4,
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
    justifyContent: "center",
    alignItems: "center",
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    width: "85%",
    maxHeight: "90%",
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
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
});
