import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  Image,
  ActivityIndicator,
  Platform,
  ScrollView,
  BackHandler,
} from "react-native";
import { KeyboardAvoidingView } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MaterialIcons, MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { showImagePickerMenu } from "@/lib/image-picker-utils";
import Colors from "@/constants/colors";
import { apiRequest, queryClient, getApiUrl } from "@/lib/query-client";
import { useT } from "@/lib/language-context";

interface Campaign {
  id: string;
  name: string;
  sponsor: string;
  imageUrl: string | null;
  linkUrl: string | null;
  displayMode: string;
  description: string | null;
  isActive: boolean;
  impressions: number;
  targetUserType: string;
  rotationDuration: number;
  rotationMode: string;
  sortOrder: number;
  placement: string;
  imageVersion: number;
}

type TabKey = "biker" | "zavorrina" | "coppia" | "tutti";

interface RNFileForUpload {
  uri: string;
  name: string;
  type: string;
}

const TABS: { key: TabKey; label: string; icon: string; iconSet: "material" | "community" | "ionicons"; color: string }[] = [
  { key: "tutti", label: "Tutti", icon: "people-outline", iconSet: "ionicons", color: Colors.textSecondary },
  { key: "biker", label: "Biker", icon: "motorcycle", iconSet: "material", color: Colors.accent },
  { key: "zavorrina", label: "Zavorrine", icon: "seat-passenger", iconSet: "community", color: Colors.femaleIcon },
  { key: "coppia", label: "Coppie", icon: "people", iconSet: "material", color: Colors.coupleIcon },
];

const webTopInset = 0;
const webBottomInset = 0;

function CampaignCard({
  item,
  onToggle,
  onEdit,
}: {
  item: Campaign;
  onToggle: (id: string, isActive: boolean) => void;
  onEdit: (item: Campaign) => void;
}) {
  const [imageError, setImageError] = useState(false);

  const imageUri = item.imageUrl
    ? (() => {
        const v = item.imageVersion ?? 0;
        const base = item.imageUrl.startsWith("http")
          ? item.imageUrl
          : `${getApiUrl().replace(/\/$/, "")}${item.imageUrl}`;
        return `${base}${base.includes("?") ? "&" : "?"}v=${v}`;
      })()
    : null;

  return (
    <View style={styles.card}>
      {imageUri && !imageError ? (
        <Image
          source={{ uri: imageUri }}
          style={styles.cardImage}
          resizeMode="cover"
          onError={() => setImageError(true)}
        />
      ) : imageUri && imageError ? (
        <View style={[styles.cardImage, styles.imageFallback]}>
          <MaterialIcons name="broken-image" size={28} color={Colors.textSecondary} />
          <Text style={styles.imageFallbackText}>Immagine non disponibile</Text>
        </View>
      ) : null}
      <View style={styles.cardBody}>
        <View style={styles.cardInfo}>
          <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
          {item.description ? (
            <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
          ) : null}
          {item.linkUrl ? (
            <Text style={styles.cardLink} numberOfLines={1}>{item.linkUrl}</Text>
          ) : null}
          <View style={styles.cardMeta}>
            <View style={[styles.badge, { backgroundColor: item.isActive ? Colors.success + "22" : Colors.error + "22" }]}>
              <Text style={[styles.badgeText, { color: item.isActive ? Colors.success : Colors.error }]}>
                {item.isActive ? "Attiva" : "Disattiva"}
              </Text>
            </View>
            <Text style={styles.cardImpressions}>{item.impressions} impressioni</Text>
          </View>
        </View>
        <View style={styles.cardActions}>
          {item.isActive ? (
            <TouchableOpacity onPress={() => onToggle(item.id, false)} style={styles.actionBtn}>
              <MaterialIcons name="pause-circle-filled" size={28} color={Colors.warning} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => onToggle(item.id, true)} style={styles.actionBtn}>
              <MaterialIcons name="play-circle-filled" size={28} color={Colors.success} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => onEdit(item)} style={styles.actionBtn}>
            <MaterialIcons name="edit" size={24} color={Colors.accent} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export default function ModeratorCampaigns() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>("tutti");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);

  const [formName, setFormName] = useState("");
  const [formLinkUrl, setFormLinkUrl] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formImageUri, setFormImageUri] = useState<string | null>(null);

  const { data: allCampaigns = [], isLoading } = useQuery<Campaign[]>({
    queryKey: ["/api/moderator/advertisements"],
  });

  const campaigns = activeTab === "tutti" ? allCampaigns : allCampaigns.filter((c) => c.targetUserType === activeTab);

  const createMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/moderator/advertisements", baseUrl);
      const res = await globalThis.fetch(url.toString(), {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status}: ${text}`);
      }
      return res.json() as Promise<Campaign>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/moderator/advertisements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ads/active"] });
      setShowCreateModal(false);
      resetForm();
    },
    onError: (err: Error) => Alert.alert("Errore", err.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, formData }: { id: string; formData: FormData }) => {
      const baseUrl = getApiUrl();
      const url = new URL(`/api/moderator/advertisements/${id}`, baseUrl);
      const res = await globalThis.fetch(url.toString(), {
        method: "PUT",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status}: ${text}`);
      }
      return res.json() as Promise<Campaign>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/moderator/advertisements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ads/active"] });
      setEditingCampaign(null);
      resetForm();
    },
    onError: (err: Error) => Alert.alert("Errore", err.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await apiRequest("PUT", `/api/moderator/advertisements/${id}`, { isActive });
      return res.json() as Promise<Campaign>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/moderator/advertisements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ads/active"] });
    },
  });

  function resetForm() {
    setFormName("");
    setFormLinkUrl("");
    setFormDescription("");
    setFormImageUri(null);
  }

  function openEdit(campaign: Campaign) {
    setFormName(campaign.name);
    setFormLinkUrl(campaign.linkUrl ?? "");
    setFormDescription(campaign.description ?? "");
    setFormImageUri(null);
    setEditingCampaign(campaign);
  }

  const pickImage = useCallback(() => {
    showImagePickerMenu(
      (uri) => setFormImageUri(uri),
      { quality: 0.8, aspect: [16, 11] }
    );
  }, []);

  function buildFormData(targetUserType: string): FormData {
    const formData = new FormData();
    formData.append("name", formName.trim());
    formData.append("targetUserType", targetUserType);
    formData.append("placement", "home");
    if (formLinkUrl.trim()) formData.append("linkUrl", formLinkUrl.trim());
    if (formDescription.trim()) formData.append("description", formDescription.trim());
    if (formImageUri) {
      const filename = formImageUri.split("/").pop() ?? "image.jpg";
      const match = /\.(\w+)$/.exec(filename);
      const mimeType = match ? `image/${match[1]}` : "image/jpeg";
      const file: RNFileForUpload = { uri: formImageUri, name: filename, type: mimeType };
      formData.append("image", file as unknown as Blob);
    }
    return formData;
  }

  function handleCreate() {
    if (!formName.trim()) return;
    const target = activeTab === "tutti" ? "biker" : activeTab;
    createMutation.mutate(buildFormData(target));
  }

  function handleUpdate() {
    if (!editingCampaign || !formName.trim()) return;
    updateMutation.mutate({ id: editingCampaign.id, formData: buildFormData(editingCampaign.targetUserType) });
  }

  const renderTab = ({ key, label, icon, iconSet, color }: (typeof TABS)[0]) => {
    const active = activeTab === key;
    const IconComp = iconSet === "material" ? MaterialIcons : iconSet === "community" ? MaterialCommunityIcons : Ionicons;
    return (
      <TouchableOpacity
        key={key}
        style={[styles.tabBtn, active && { borderBottomColor: color, borderBottomWidth: 2 }]}
        onPress={() => setActiveTab(key)}
      >
        <IconComp name={icon as "motorcycle"} size={18} color={active ? color : Colors.textSecondary} />
        <Text style={[styles.tabLabel, { color: active ? color : Colors.textSecondary }]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  const isEditing = !!editingCampaign;
  const showModal = showCreateModal || isEditing;
  const isPending = createMutation.isPending || updateMutation.isPending;

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const onBack = () => {
      if (showModal) {
        setShowCreateModal(false);
        setEditingCampaign(null);
        resetForm();
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", onBack);
    return () => sub.remove();
  }, [showModal]);

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <View style={[styles.container, { paddingTop: Math.max(insets.top, webTopInset), paddingBottom: webBottomInset }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace("/moderator")}>
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Campagne</Text>
          <TouchableOpacity onPress={() => setShowCreateModal(true)} style={styles.addBtn}>
            <Ionicons name="add" size={26} color={Colors.accent} />
          </TouchableOpacity>
        </View>

        <View style={styles.tabs}>
          {TABS.map(renderTab)}
        </View>

        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={Colors.accent} />
          </View>
        ) : campaigns.length === 0 ? (
          <View style={styles.center}>
            <MaterialIcons name="campaign" size={56} color={Colors.textSecondary} />
            <Text style={styles.emptyText}>Nessuna campagna</Text>
          </View>
        ) : (
          <FlatList
            data={campaigns}
            keyExtractor={(c) => c.id}
            renderItem={({ item }) => (
              <CampaignCard
                item={item}
                onToggle={(id, v) => toggleMutation.mutate({ id, isActive: v })}
                onEdit={openEdit}
              />
            )}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
        )}

        <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => { setShowCreateModal(false); setEditingCampaign(null); resetForm(); }}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView behavior="padding" style={{ width: "100%" }}>
              <ScrollView style={styles.modalBox} keyboardShouldPersistTaps="handled">
                <Text style={styles.modalTitle}>{isEditing ? t("moderator.editCampaign") : t("moderator.newCampaign")}</Text>

                <Text style={styles.fieldLabel}>Nome *</Text>
                <TextInput style={styles.input} value={formName} onChangeText={setFormName} placeholder="Nome campagna" placeholderTextColor={Colors.textSecondary} />

                <Text style={styles.fieldLabel}>Link URL</Text>
                <TextInput style={styles.input} value={formLinkUrl} onChangeText={setFormLinkUrl} placeholder="https://..." placeholderTextColor={Colors.textSecondary} keyboardType="url" autoCapitalize="none" />

                <Text style={styles.fieldLabel}>Descrizione</Text>
                <TextInput style={[styles.input, { height: 80 }]} value={formDescription} onChangeText={setFormDescription} placeholder="Descrizione breve" placeholderTextColor={Colors.textSecondary} multiline />

                <TouchableOpacity style={styles.imagePickerBtn} onPress={pickImage}>
                  {formImageUri ? (
                    <Image source={{ uri: formImageUri }} style={styles.previewImage} resizeMode="cover" />
                  ) : (
                    <>
                      <MaterialIcons name="add-photo-alternate" size={28} color={Colors.accent} />
                      <Text style={styles.imagePickerLabel}>{isEditing ? t("moderator.changeImage") : t("moderator.addImage")}</Text>
                    </>
                  )}
                </TouchableOpacity>

                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => { setShowCreateModal(false); setEditingCampaign(null); resetForm(); }}>
                    <Text style={styles.cancelText}>Annulla</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.createBtn, (!formName.trim() || isPending) && { opacity: 0.5 }]}
                    onPress={isEditing ? handleUpdate : handleCreate}
                    disabled={!formName.trim() || isPending}
                  >
                    {isPending
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={styles.createText}>{isEditing ? t("moderator.save") : t("moderator.create")}</Text>
                    }
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          </View>
        </Modal>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: Colors.text },
  addBtn: { padding: 4 },
  tabs: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: Colors.border, paddingHorizontal: 8 },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 10, gap: 2 },
  tabLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  emptyText: { fontSize: 15, color: Colors.textSecondary, fontFamily: "Inter_500Medium" },
  list: { padding: 16, gap: 12 },
  card: { backgroundColor: Colors.surface, borderRadius: 14, overflow: "hidden", marginBottom: 12 },
  cardImage: { width: "100%", height: 160, backgroundColor: Colors.surfaceLight },
  imageFallback: { alignItems: "center", justifyContent: "center", gap: 6 },
  imageFallbackText: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary },
  cardBody: { flexDirection: "row", alignItems: "center", padding: 12, gap: 12 },
  cardInfo: { flex: 1, gap: 4 },
  cardName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.text },
  cardDesc: { fontSize: 13, color: Colors.textSecondary, fontFamily: "Inter_400Regular" },
  cardLink: { fontSize: 11, color: Colors.accent, fontFamily: "Inter_400Regular" },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  cardImpressions: { fontSize: 11, color: Colors.textSecondary, fontFamily: "Inter_400Regular" },
  cardActions: { gap: 4 },
  actionBtn: { padding: 4 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end", alignItems: "center" },
  modalBox: { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, maxHeight: "90%" },
  modalTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: Colors.text, marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.textSecondary, marginBottom: 6 },
  input: {
    backgroundColor: Colors.surfaceLight, borderRadius: 10, paddingHorizontal: 14,
    paddingVertical: 10, color: Colors.text, fontFamily: "Inter_400Regular", fontSize: 14, marginBottom: 14,
  },
  imagePickerBtn: {
    height: 120, backgroundColor: Colors.surfaceLight, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border, borderStyle: "dashed",
    justifyContent: "center", alignItems: "center", marginBottom: 20, gap: 8, overflow: "hidden",
  },
  imagePickerLabel: { fontSize: 14, color: Colors.accent, fontFamily: "Inter_500Medium" },
  previewImage: { width: "100%", height: "100%" },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 12, paddingBottom: 8 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10, borderWidth: 1, borderColor: Colors.border },
  cancelText: { color: Colors.textSecondary, fontFamily: "Inter_500Medium", fontSize: 14 },
  createBtn: { paddingVertical: 10, paddingHorizontal: 24, borderRadius: 10, backgroundColor: Colors.accent },
  createText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },
});
