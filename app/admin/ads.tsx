import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  Image,
  ActivityIndicator,
  Platform,
} from "react-native";
import { KeyboardAvoidingView } from "react-native";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MaterialIcons, MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { showImagePickerMenu, pickMultipleImages, BulkImageAsset } from "@/lib/image-picker-utils";
import Colors from "@/constants/colors";
import { apiRequest, queryClient, getApiUrl } from "@/lib/query-client";

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

interface ImageHealthData {
  brokenIds: string[];
  checkedAt: string | null;
  isRunning: boolean;
}

type RNFilePayload = { uri: string; name: string; type: string };

interface BulkUploadResponse {
  created: number;
  failed: number;
  campaigns: { id: string; name: string; imageUrl: string | null; isActive: boolean }[];
  failedFiles: string[];
}

type TabKey = "biker" | "zavorrina" | "coppia" | "tutti";

const TABS: { key: TabKey; label: string; icon: string; iconSet: "material" | "community" | "ionicons"; color: string }[] = [
  { key: "tutti", label: "Tutti", icon: "people-outline", iconSet: "ionicons", color: Colors.textSecondary },
  { key: "biker", label: "Biker", icon: "motorcycle", iconSet: "material", color: Colors.accent },
  { key: "zavorrina", label: "Zavorrine", icon: "seat-passenger", iconSet: "community", color: Colors.femaleIcon },
  { key: "coppia", label: "Coppie", icon: "people", iconSet: "material", color: Colors.coupleIcon },
];


function CampaignCard({
  item,
  onToggle,
  onDelete,
  isBroken,
}: {
  item: Campaign;
  onToggle: (id: string, isActive: boolean) => void;
  onDelete: (item: Campaign) => void;
  isBroken?: boolean;
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
    <View style={[styles.card, isBroken && styles.cardBroken]}>
      {imageUri && !imageError ? (
        <Image
          source={{ uri: imageUri }}
          style={styles.cardImage}
          resizeMode="cover"
          onError={() => setImageError(true)}
        />
      ) : imageUri && (imageError || isBroken) ? (
        <View style={[styles.cardImage, styles.imageFallback]}>
          <MaterialIcons name="broken-image" size={28} color={Colors.error} />
          <Text style={[styles.imageFallbackText, { color: Colors.error }]}>Immagine non raggiungibile</Text>
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
            {isBroken && (
              <View style={[styles.badge, { backgroundColor: Colors.error + "22" }]}>
                <MaterialIcons name="broken-image" size={11} color={Colors.error} style={{ marginRight: 2 }} />
                <Text style={[styles.badgeText, { color: Colors.error }]}>Immagine rotta</Text>
              </View>
            )}
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
          <TouchableOpacity onPress={() => onDelete(item)} style={styles.actionBtn}>
            <MaterialIcons name="delete-outline" size={26} color={Colors.error} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export default function AdminAds() {
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("tutti");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isRestartingAll, setIsRestartingAll] = useState(false);

  const [formName, setFormName] = useState("");
  const [formLinkUrl, setFormLinkUrl] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formImageUri, setFormImageUri] = useState<string | null>(null);

  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkBaseName, setBulkBaseName] = useState("");
  const [bulkTarget, setBulkTarget] = useState<TabKey>("tutti");
  const [bulkDuration, setBulkDuration] = useState("10");
  const [bulkImages, setBulkImages] = useState<BulkImageAsset[]>([]);
  const [bulkUploading, setBulkUploading] = useState(false);

  const [settingsDuration, setSettingsDuration] = useState("10");
  const [settingsMode, setSettingsMode] = useState<"sequential" | "random">("sequential");

  const { data: allCampaigns = [], isLoading } = useQuery<Campaign[]>({
    queryKey: ["/api/admin/advertisements"],
  });

  const { data: imageHealth } = useQuery<ImageHealthData>({
    queryKey: ["/api/admin/advertisements/image-health"],
    refetchInterval: 60_000,
  });

  const [healthBannerDismissed, setHealthBannerDismissed] = useState(false);

  async function handleCheckImages() {
    try {
      await apiRequest("POST", "/api/admin/advertisements/image-health/check");
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/advertisements/image-health"] });
      }, 3000);
    } catch {
    }
  }

  const campaigns = activeTab === "tutti" ? allCampaigns : allCampaigns.filter((c) => c.targetUserType === activeTab);

  const brokenIdSet = new Set<string>(imageHealth?.brokenIds ?? []);
  const brokenInView = campaigns.filter((c) => brokenIdSet.has(c.id));

  const createMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/advertisements", baseUrl);
      const res = await globalThis.fetch(url.toString(), {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status}: ${text}`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/advertisements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ads/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ads/my-ads"] });
      setShowCreateModal(false);
      resetForm();
    },
    onError: (err: Error) => {
      Alert.alert("Errore", err.message);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await apiRequest("PUT", `/api/admin/advertisements/${id}`, { isActive });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/advertisements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ads/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ads/my-ads"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/advertisements/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/advertisements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ads/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ads/my-ads"] });
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    },
  });

  const updateRotationMutation = useMutation({
    mutationFn: async ({ ids, rotationDuration, rotationMode }: { ids: string[]; rotationDuration: number; rotationMode: string }) => {
      await Promise.all(
        ids.map((id) =>
          apiRequest("PUT", `/api/admin/advertisements/${id}`, { rotationDuration, rotationMode })
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/advertisements"] });
      setShowSettingsModal(false);
    },
  });

  async function handleRestartAll() {
    const activeCampaigns = campaigns.filter((c) => c.isActive);
    if (activeCampaigns.length === 0) return;
    setIsRestartingAll(true);
    try {
      for (const campaign of activeCampaigns) {
        await apiRequest("PUT", `/api/admin/advertisements/${campaign.id}`, { isActive: false });
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await apiRequest("PUT", `/api/admin/advertisements/${campaign.id}`, { isActive: true, bumpImageVersion: true });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/advertisements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ads/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ads/my-ads"] });
    } catch {
      Alert.alert("Errore", "Riavvio campagne non riuscito. Riprova.");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/advertisements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ads/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ads/my-ads"] });
    } finally {
      setIsRestartingAll(false);
    }
  }

  function resetForm() {
    setFormName("");
    setFormLinkUrl("");
    setFormDescription("");
    setFormImageUri(null);
  }

  const pickImage = useCallback(() => {
    showImagePickerMenu(
      (uri) => {
        setFormImageUri(uri);
      },
      { quality: 0.8, aspect: [16, 11] }
    );
  }, []);

  async function handlePickBulkImages() {
    const { assets, skipped } = await pickMultipleImages({ quality: 0.8, selectionLimit: 50 });
    if (assets.length > 0) {
      setBulkImages((prev) => {
        const existingUris = new Set(prev.map((a) => a.uri));
        const newOnes = assets.filter((a) => !existingUris.has(a.uri));
        return [...prev, ...newOnes];
      });
    }
    if (skipped > 0) {
      Alert.alert(
        "Immagini troppo grandi",
        `${skipped} immagin${skipped === 1 ? "e è stata ignorata" : "i sono state ignorate"} perché supera${skipped === 1 ? "" : "no"} il limite di 5 MB.`
      );
    }
  }

  async function handleBulkCreate() {
    if (!bulkBaseName.trim() || bulkImages.length === 0 || bulkUploading) return;
    setBulkUploading(true);

    try {
      const formData = new FormData();
      formData.append("baseName", bulkBaseName.trim());
      formData.append("targetUserType", bulkTarget);
      formData.append("displayDuration", String(parseInt(bulkDuration) || 10));

      for (const img of bulkImages) {
        const rawFilename = img.uri.split("/").pop() || "image.jpg";
        const match = /\.(\w+)$/.exec(rawFilename);
        const mimeType = match ? `image/${match[1].toLowerCase()}` : "image/jpeg";
        const payload: RNFilePayload = { uri: img.uri, name: rawFilename, type: mimeType };
        formData.append("images", payload as unknown as Blob);
      }

      const bulkUrl = new URL("/api/admin/advertisements/bulk", getApiUrl()).toString();
      const res = await globalThis.fetch(bulkUrl, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      const data: BulkUploadResponse = await res.json();
      const created = data.created ?? 0;
      const failed = data.failed ?? 0;

      queryClient.invalidateQueries({ queryKey: ["/api/admin/advertisements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ads/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ads/my-ads"] });

      setShowBulkModal(false);
      setBulkBaseName("");
      setBulkImages([]);
      setBulkTarget("tutti");
      setBulkDuration("10");

      const summary =
        `${created} campagn${created === 1 ? "a" : "e"} creat${created === 1 ? "a" : "e"}` +
        (failed > 0 ? `, ${failed} ignorat${failed === 1 ? "a" : "e"}.` : ".");
      Alert.alert("Upload completato", summary);
    } catch (err) {
      Alert.alert("Errore", "Upload non riuscito. Riprova.");
      console.error("[bulk upload]", err);
    } finally {
      setBulkUploading(false);
    }
  }

  function handleCreate() {
    if (!formName.trim() || !formImageUri) return;

    const formData = new FormData();
    formData.append("name", formName.trim());
    formData.append("targetUserType", activeTab);
    formData.append("placement", "home");
    if (formLinkUrl.trim()) formData.append("linkUrl", formLinkUrl.trim());
    if (formDescription.trim()) formData.append("description", formDescription.trim());

    if (formImageUri) {
      const filename = formImageUri.split("/").pop() || "image.jpg";
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : "image/jpeg";
      formData.append("image", {
        uri: formImageUri,
        name: filename,
        type,
      } as any);
    }

    createMutation.mutate(formData);
  }

  function handleDelete(campaign: Campaign) {
    Alert.alert("Elimina campagna", `Eliminare "${campaign.name}"?`, [
      { text: "Annulla", style: "cancel" },
      { text: "Elimina", style: "destructive", onPress: () => deleteMutation.mutate(campaign.id) },
    ]);
  }

  function openRotationSettings() {
    const firstCampaign = campaigns[0];
    if (firstCampaign) {
      setSettingsDuration(String(firstCampaign.rotationDuration));
      setSettingsMode(firstCampaign.rotationMode as "sequential" | "random");
    } else {
      setSettingsDuration("10");
      setSettingsMode("sequential");
    }
    setShowSettingsModal(true);
  }

  function handleSaveRotation() {
    const duration = parseInt(settingsDuration) || 10;
    const ids = campaigns.map((c) => c.id);
    if (ids.length === 0) {
      setShowSettingsModal(false);
      return;
    }
    updateRotationMutation.mutate({ ids, rotationDuration: duration, rotationMode: settingsMode });
  }

  const currentTab = TABS.find((t) => t.key === activeTab)!;

  return (
    <View style={styles.container}>
      <View style={styles.tabBar}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, isActive && { borderBottomColor: tab.color, borderBottomWidth: 3 }]}
              onPress={() => setActiveTab(tab.key)}
            >
              {tab.iconSet === "community" ? (
                <MaterialCommunityIcons name={tab.icon as any} size={22} color={isActive ? tab.color : Colors.textSecondary} />
              ) : tab.iconSet === "ionicons" ? (
                <Ionicons name={tab.icon as any} size={22} color={isActive ? tab.color : Colors.textSecondary} />
              ) : (
                <MaterialIcons name={tab.icon as any} size={22} color={isActive ? tab.color : Colors.textSecondary} />
              )}
              <Text style={[styles.tabLabel, isActive && { color: tab.color }]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {brokenInView.length > 0 && !healthBannerDismissed && (
        <View style={styles.brokenBanner}>
          <MaterialIcons name="warning" size={16} color={Colors.error} />
          <Text style={styles.brokenBannerText} numberOfLines={2}>
            {brokenInView.length === 1
              ? `1 campagna ha un'immagine non raggiungibile`
              : `${brokenInView.length} campagne hanno immagini non raggiungibili`}
          </Text>
          <TouchableOpacity onPress={() => setHealthBannerDismissed(true)} style={styles.brokenBannerClose}>
            <MaterialIcons name="close" size={16} color={Colors.error} />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.toolbar}>
        <View>
          <Text style={styles.countText}>{campaigns.length} campagn{campaigns.length === 1 ? "a" : "e"}</Text>
          {imageHealth?.checkedAt ? (
            <Text style={styles.checkedAtText}>
              {imageHealth.isRunning ? "Verifica in corso…" : `Verifica: ${new Date(imageHealth.checkedAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`}
            </Text>
          ) : imageHealth?.isRunning ? (
            <Text style={styles.checkedAtText}>Verifica in corso…</Text>
          ) : null}
        </View>
        <View style={styles.toolbarActions}>
          <TouchableOpacity
            onPress={handleRestartAll}
            disabled={isRestartingAll || campaigns.filter((c) => c.isActive).length === 0}
            style={styles.toolbarBtn}
          >
            {isRestartingAll ? (
              <ActivityIndicator size="small" color={Colors.accent} />
            ) : (
              <MaterialIcons name="replay" size={20} color={campaigns.filter((c) => c.isActive).length > 0 ? Colors.accent : Colors.textSecondary} />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/admin/advertisements"] });
              handleCheckImages();
              setHealthBannerDismissed(false);
            }}
            style={styles.toolbarBtn}
          >
            <MaterialIcons name="refresh" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={openRotationSettings} style={styles.toolbarBtn}>
            <MaterialIcons name="settings" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={campaigns}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <CampaignCard
              item={item}
              onToggle={(id, isActive) => toggleMutation.mutate({ id, isActive })}
              onDelete={handleDelete}
              isBroken={brokenIdSet.has(item.id)}
            />
          )}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 80 }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialIcons name="campaign" size={48} color={Colors.textSecondary} />
              <Text style={styles.emptyText}>Nessuna campagna per {currentTab.label}</Text>
              <Text style={styles.emptySubtext}>Premi + per aggiungerne una</Text>
            </View>
          }
        />
      )}

      <TouchableOpacity
        style={[styles.fab, styles.fabFolder, { bottom: insets.bottom + 16 }]}
        onPress={() => setShowBulkModal(true)}
      >
        <MaterialIcons name="folder-open" size={24} color={Colors.accent} />
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: currentTab.color, bottom: insets.bottom + 16 }]}
        onPress={() => setShowCreateModal(true)}
      >
        <MaterialIcons name="add" size={28} color={Colors.background} />
      </TouchableOpacity>

      <Modal visible={showCreateModal} animationType="slide">
        <View style={[styles.createModalContainer, { paddingTop: insets.top, paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Nuova Campagna — {currentTab.label}</Text>
            <TouchableOpacity onPress={() => { setShowCreateModal(false); resetForm(); }}>
              <MaterialIcons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <KeyboardAwareScrollViewCompat bottomOffset={20} keyboardShouldPersistTaps="handled">
            <TouchableOpacity style={styles.imagePickerBtn} onPress={pickImage}>
              {formImageUri ? (
                <Image source={{ uri: formImageUri }} style={styles.imagePreview} resizeMode="cover" />
              ) : (
                <View style={styles.imagePlaceholder}>
                  <MaterialIcons name="add-photo-alternate" size={36} color={Colors.textSecondary} />
                  <Text style={styles.imagePlaceholderText}>Carica immagine</Text>
                </View>
              )}
            </TouchableOpacity>

            <TextInput
              style={styles.input}
              placeholder="Nome campagna *"
              placeholderTextColor={Colors.textSecondary}
              value={formName}
              onChangeText={setFormName}
            />
            <TextInput
              style={styles.input}
              placeholder="URL Link (es. https://...)"
              placeholderTextColor={Colors.textSecondary}
              value={formLinkUrl}
              onChangeText={setFormLinkUrl}
              keyboardType="url"
              autoCapitalize="none"
            />
            <TextInput
              style={[styles.input, { minHeight: 80 }]}
              placeholder="Descrizione"
              placeholderTextColor={Colors.textSecondary}
              value={formDescription}
              onChangeText={setFormDescription}
              multiline
              textAlignVertical="top"
            />

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: Colors.accent, opacity: (!formName.trim() || !formImageUri) ? 0.4 : 1 }]}
              disabled={!formName.trim() || !formImageUri || createMutation.isPending}
              onPress={handleCreate}
            >
              {createMutation.isPending ? (
                <ActivityIndicator color={Colors.background} />
              ) : (
                <Text style={styles.submitBtnText}>Crea Campagna</Text>
              )}
            </TouchableOpacity>
          </KeyboardAwareScrollViewCompat>
        </View>
      </Modal>

      <Modal visible={showBulkModal} animationType="slide">
        <View style={[styles.createModalContainer, { paddingTop: insets.top, paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Carica cartella</Text>
            <TouchableOpacity onPress={() => { if (!bulkUploading) { setShowBulkModal(false); setBulkBaseName(""); setBulkImages([]); setBulkTarget("tutti"); } }}>
              <MaterialIcons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
            <TextInput
              style={styles.input}
              placeholder="Nome base campagna *  (es. Estate 2026)"
              placeholderTextColor={Colors.textSecondary}
              value={bulkBaseName}
              onChangeText={setBulkBaseName}
              editable={!bulkUploading}
            />

            <Text style={styles.settingsLabel}>Target utenti</Text>
            <View style={styles.targetRow}>
              {TABS.map((tab) => (
                <TouchableOpacity
                  key={tab.key}
                  style={[styles.targetChip, bulkTarget === tab.key && { borderColor: tab.color, backgroundColor: tab.color + "22" }]}
                  onPress={() => !bulkUploading && setBulkTarget(tab.key)}
                >
                  {tab.iconSet === "community" ? (
                    <MaterialCommunityIcons name={tab.icon as any} size={14} color={bulkTarget === tab.key ? tab.color : Colors.textSecondary} />
                  ) : tab.iconSet === "ionicons" ? (
                    <Ionicons name={tab.icon as any} size={14} color={bulkTarget === tab.key ? tab.color : Colors.textSecondary} />
                  ) : (
                    <MaterialIcons name={tab.icon as any} size={14} color={bulkTarget === tab.key ? tab.color : Colors.textSecondary} />
                  )}
                  <Text style={[styles.targetChipText, bulkTarget === tab.key && { color: tab.color }]}>{tab.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.settingsLabel}>Durata rotazione (secondi)</Text>
            <TextInput
              style={[styles.input, { marginBottom: 20 }]}
              placeholder="10"
              placeholderTextColor={Colors.textSecondary}
              value={bulkDuration}
              onChangeText={setBulkDuration}
              keyboardType="number-pad"
              editable={!bulkUploading}
            />

            <TouchableOpacity
              style={[styles.pickImagesBtn, bulkUploading && { opacity: 0.5 }]}
              onPress={handlePickBulkImages}
              disabled={bulkUploading}
            >
              <MaterialIcons name="add-photo-alternate" size={22} color={Colors.accent} />
              <Text style={styles.pickImagesBtnText}>
                {bulkImages.length === 0 ? "Scegli immagini" : `Aggiungi immagini (${bulkImages.length} selezionate)`}
              </Text>
            </TouchableOpacity>

            {bulkImages.length > 0 && (
              <View style={styles.thumbnailGrid}>
                {bulkImages.map((img, idx) => (
                  <View key={img.uri + idx} style={styles.thumbnailWrap}>
                    <Image source={{ uri: img.uri }} style={styles.thumbnail} resizeMode="cover" />
                    {!bulkUploading && (
                      <TouchableOpacity
                        style={styles.thumbnailRemove}
                        onPress={() => setBulkImages((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        <MaterialIcons name="close" size={12} color="#fff" />
                      </TouchableOpacity>
                    )}
                    <View style={styles.thumbnailIndex}>
                      <Text style={styles.thumbnailIndexText}>#{idx + 1}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.submitBtn,
                {
                  backgroundColor: Colors.accent,
                  opacity: !bulkBaseName.trim() || bulkImages.length === 0 || bulkUploading ? 0.4 : 1,
                  marginTop: 20,
                },
              ]}
              disabled={!bulkBaseName.trim() || bulkImages.length === 0 || bulkUploading}
              onPress={handleBulkCreate}
            >
              {bulkUploading ? (
                <ActivityIndicator color={Colors.background} />
              ) : (
                <Text style={styles.submitBtnText}>
                  {bulkImages.length === 0
                    ? "Carica immagini"
                    : `Carica ${bulkImages.length} immagin${bulkImages.length === 1 ? "e" : "i"}`}
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={showSettingsModal} animationType="fade" transparent>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={[styles.settingsContent, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Rotazione — {currentTab.label}</Text>
              <TouchableOpacity onPress={() => setShowSettingsModal(false)}>
                <MaterialIcons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.settingsLabel}>Durata (secondi)</Text>
            <TextInput
              style={styles.input}
              value={settingsDuration}
              onChangeText={setSettingsDuration}
              keyboardType="number-pad"
              placeholder="10"
              placeholderTextColor={Colors.textSecondary}
            />

            <Text style={styles.settingsLabel}>Modalità</Text>
            <View style={styles.modeRow}>
              <TouchableOpacity
                style={[styles.modeBtn, settingsMode === "sequential" && { borderColor: currentTab.color, backgroundColor: currentTab.color + "22" }]}
                onPress={() => setSettingsMode("sequential")}
              >
                <MaterialIcons name="swap-vert" size={18} color={settingsMode === "sequential" ? currentTab.color : Colors.textSecondary} />
                <Text style={[styles.modeBtnText, settingsMode === "sequential" && { color: currentTab.color }]}>Sequenziale</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeBtn, settingsMode === "random" && { borderColor: currentTab.color, backgroundColor: currentTab.color + "22" }]}
                onPress={() => setSettingsMode("random")}
              >
                <MaterialIcons name="shuffle" size={18} color={settingsMode === "random" ? currentTab.color : Colors.textSecondary} />
                <Text style={[styles.modeBtnText, settingsMode === "random" && { color: currentTab.color }]}>Random</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: currentTab.color }]}
              onPress={handleSaveRotation}
              disabled={updateRotationMutation.isPending}
            >
              {updateRotationMutation.isPending ? (
                <ActivityIndicator color={Colors.background} />
              ) : (
                <Text style={styles.submitBtnText}>Salva Impostazioni</Text>
              )}
            </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  tabBar: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    gap: 6,
    borderBottomWidth: 3,
    borderBottomColor: "transparent",
  },
  tabLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  toolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  countText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  checkedAtText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    opacity: 0.7,
    marginTop: 1,
  },
  toolbarBtn: {
    padding: 4,
  },
  toolbarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    marginBottom: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardBroken: {
    borderColor: Colors.error,
    borderWidth: 1.5,
  },
  brokenBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.error + "18",
    borderBottomWidth: 1,
    borderBottomColor: Colors.error + "44",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  brokenBannerText: {
    flex: 1,
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.error,
  },
  brokenBannerClose: {
    padding: 2,
  },
  cardImage: {
    width: "100%",
    height: 140,
    backgroundColor: Colors.surfaceLight,
  },
  imageFallback: {
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  imageFallbackText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  cardBody: {
    flexDirection: "row",
    padding: 14,
    alignItems: "center",
  },
  cardInfo: { flex: 1 },
  cardName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: Colors.text,
  },
  cardDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 3,
  },
  cardLink: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.accent,
    marginTop: 3,
  },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 8,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeText: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
  },
  cardImpressions: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
  },
  cardActions: {
    flexDirection: "column",
    gap: 8,
    marginLeft: 8,
  },
  actionBtn: {
    padding: 4,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 60,
    gap: 10,
  },
  emptyText: {
    fontFamily: "Inter_500Medium",
    fontSize: 16,
    color: Colors.textSecondary,
  },
  emptySubtext: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  fab: {
    position: "absolute",
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 5 },
      android: {},
      web: { boxShadow: "0px 3px 5px rgba(0,0,0,0.3)" },
    }),
  },
  createModalContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: "85%",
  },
  settingsContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: "60%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 18,
    color: Colors.text,
  },
  imagePickerBtn: {
    marginBottom: 16,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: "dashed",
  },
  imagePreview: {
    width: "100%",
    aspectRatio: 16 / 11,
  },
  imagePlaceholder: {
    width: "100%",
    aspectRatio: 16 / 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background,
    gap: 6,
  },
  imagePlaceholderText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  input: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  settingsLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  modeRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 20,
  },
  modeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modeBtnText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  submitBtn: {
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: Colors.background,
  },
  fabFolder: {
    right: 88,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  targetRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 20,
  },
  targetChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  targetChipText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  pickImagesBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderWidth: 1.5,
    borderColor: Colors.accent,
    borderStyle: "dashed",
    borderRadius: 12,
    padding: 18,
    marginBottom: 16,
    backgroundColor: Colors.accent + "0A",
  },
  pickImagesBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.accent,
  },
  thumbnailGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  thumbnailWrap: {
    width: "30%",
    aspectRatio: 1,
    borderRadius: 10,
    overflow: "hidden",
    position: "relative",
    backgroundColor: Colors.surfaceLight,
  },
  thumbnail: {
    width: "100%",
    height: "100%",
  },
  thumbnailRemove: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  thumbnailIndex: {
    position: "absolute",
    bottom: 4,
    left: 4,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  thumbnailIndexText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    color: "#fff",
  },
});
