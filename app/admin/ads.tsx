import React, { useState, useCallback, useRef } from "react";
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
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MaterialIcons, MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { showImagePickerMenu } from "@/lib/image-picker-utils";
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
}

type TabKey = "biker" | "zavorrina" | "coppia";

const TABS: { key: TabKey; label: string; icon: string; iconSet: "material" | "community" | "ionicons"; color: string }[] = [
  { key: "biker", label: "Biker", icon: "motorcycle", iconSet: "material", color: Colors.accent },
  { key: "zavorrina", label: "Zavorrine", icon: "seat-passenger", iconSet: "community", color: Colors.femaleIcon },
  { key: "coppia", label: "Coppie", icon: "people", iconSet: "material", color: Colors.coupleIcon },
];

const PLACEMENT_LABELS: Record<string, string> = {
  all: "Tutti",
  home: "Home",
  match: "Match",
};

const PLACEMENT_CYCLE: Record<string, string> = {
  all: "home",
  home: "match",
  match: "all",
};

function CampaignCard({
  item,
  onToggle,
  onDelete,
  onUpdatePlacement,
}: {
  item: Campaign;
  onToggle: (id: string, isActive: boolean) => void;
  onDelete: (item: Campaign) => void;
  onUpdatePlacement: (id: string, placement: string) => void;
}) {
  const imageUri = item.imageUrl
    ? item.imageUrl.startsWith("http")
      ? item.imageUrl
      : `${getApiUrl().replace(/\/$/, "")}${item.imageUrl}`
    : null;

  const placement = item.placement || "all";

  return (
    <View style={styles.card}>
      {imageUri && (
        <Image source={{ uri: imageUri }} style={styles.cardImage} resizeMode="cover" />
      )}
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
            <TouchableOpacity
              style={[styles.badge, { backgroundColor: Colors.accent + "22" }]}
              onPress={() => onUpdatePlacement(item.id, PLACEMENT_CYCLE[placement] || "all")}
            >
              <Text style={[styles.badgeText, { color: Colors.accent }]}>
                {PLACEMENT_LABELS[placement] || placement}
              </Text>
            </TouchableOpacity>
            <Text style={styles.cardImpressions}>{item.impressions} impressioni</Text>
          </View>
        </View>
        <View style={styles.cardActions}>
          <TouchableOpacity onPress={() => onToggle(item.id, !item.isActive)} style={styles.actionBtn}>
            <MaterialIcons name={item.isActive ? "pause-circle-filled" : "play-circle-filled"} size={28} color={item.isActive ? Colors.warning : Colors.success} />
          </TouchableOpacity>
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
  const [activeTab, setActiveTab] = useState<TabKey>("biker");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const [formName, setFormName] = useState("");
  const [formLinkUrl, setFormLinkUrl] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formImageUri, setFormImageUri] = useState<string | null>(null);
  const [formPlacement, setFormPlacement] = useState<"all" | "home" | "match">("all");

  const [settingsDuration, setSettingsDuration] = useState("10");
  const [settingsMode, setSettingsMode] = useState<"sequential" | "random">("sequential");

  const { data: allCampaigns = [], isLoading } = useQuery<Campaign[]>({
    queryKey: ["/api/admin/advertisements"],
  });

  const { data: adsEnabledData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/ads-enabled"],
  });
  const adsEnabled = adsEnabledData?.enabled !== false;

  const campaigns = allCampaigns.filter((c) => c.targetUserType === activeTab);

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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/advertisements"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/advertisements/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/advertisements"] });
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

  const updatePlacementMutation = useMutation({
    mutationFn: async ({ id, placement }: { id: string; placement: string }) => {
      const res = await apiRequest("PUT", `/api/admin/advertisements/${id}`, { placement });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/advertisements"] }),
  });

  function resetForm() {
    setFormName("");
    setFormLinkUrl("");
    setFormDescription("");
    setFormImageUri(null);
    setFormPlacement("all");
  }

  const pickImage = useCallback(() => {
    showImagePickerMenu(
      (uri) => {
        setFormImageUri(uri);
      },
      { aspect: [16, 9], quality: 0.8 }
    );
  }, []);

  function handleCreate() {
    if (!formName.trim()) return;

    const formData = new FormData();
    formData.append("name", formName.trim());
    formData.append("targetUserType", activeTab);
    formData.append("placement", formPlacement);
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
              ) : (
                <MaterialIcons name={tab.icon as any} size={22} color={isActive ? tab.color : Colors.textSecondary} />
              )}
              <Text style={[styles.tabLabel, isActive && { color: tab.color }]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {adsEnabled && (
        <View style={styles.adsBanner}>
          <MaterialIcons name="warning" size={16} color={Colors.warning} />
          <Text style={styles.adsBannerText}>
            Disabilita gli annunci nelle impostazioni prima di aggiungere nuove campagne
          </Text>
        </View>
      )}

      <View style={styles.toolbar}>
        <Text style={styles.countText}>{campaigns.length} campagn{campaigns.length === 1 ? "a" : "e"}</Text>
        <TouchableOpacity onPress={openRotationSettings} style={styles.toolbarBtn}>
          <MaterialIcons name="settings" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
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
              onUpdatePlacement={(id, placement) => updatePlacementMutation.mutate({ id, placement })}
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
        style={[styles.fab, { backgroundColor: adsEnabled ? Colors.textSecondary : currentTab.color, bottom: insets.bottom + 16 }]}
        onPress={() => { if (!adsEnabled) setShowCreateModal(true); }}
        disabled={adsEnabled}
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

            <Text style={styles.settingsLabel}>Posizionamento</Text>
            <View style={styles.modeRow}>
              {([
                { key: "all", label: "Tutti" },
                { key: "home", label: "Home page" },
                { key: "match", label: "Nei Match" },
              ] as const).map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.modeBtn, formPlacement === opt.key && { borderColor: currentTab.color, backgroundColor: currentTab.color + "22" }]}
                  onPress={() => setFormPlacement(opt.key)}
                >
                  <Text style={[styles.modeBtnText, formPlacement === opt.key && { color: currentTab.color }]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: currentTab.color }, !formName.trim() && styles.submitBtnDisabled]}
              disabled={!formName.trim() || createMutation.isPending}
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
  toolbarBtn: {
    padding: 4,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  adsBanner: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    backgroundColor: Colors.warning + "20",
    borderLeftWidth: 3,
    borderLeftColor: Colors.warning,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  adsBannerText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.warning,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    marginBottom: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardImage: {
    width: "100%",
    height: 140,
    backgroundColor: Colors.surfaceLight,
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 6,
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
    height: 160,
  },
  imagePlaceholder: {
    width: "100%",
    height: 120,
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
});
