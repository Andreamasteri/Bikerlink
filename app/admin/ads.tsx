import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
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
  BackHandler,
  Switch,
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
  groupId: string | null;
}

interface ImageHealthData {
  brokenIds: string[];
  checkedAt: string | null;
  isRunning: boolean;
}

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
  onEdit,
  onEditGroup,
  groupCount,
  isBroken,
}: {
  item: Campaign;
  onToggle: (id: string, isActive: boolean) => void;
  onDelete: (item: Campaign) => void;
  onEdit: (item: Campaign) => void;
  onEditGroup?: () => void;
  groupCount?: number;
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

  useEffect(() => {
    setImageError(false);
  }, [imageUri]);

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
            {groupCount && groupCount > 1 ? (
              <View style={[styles.badge, { backgroundColor: Colors.accent + "22" }]}>
                <Text style={[styles.badgeText, { color: Colors.accent }]}>Gruppo ({groupCount})</Text>
              </View>
            ) : null}
            <Text style={styles.cardImpressions}>{item.impressions} impressioni</Text>
          </View>
          {groupCount && groupCount > 1 && onEditGroup ? (
            <TouchableOpacity onPress={onEditGroup} style={styles.groupEditBtn}>
              <MaterialIcons name="folder-special" size={13} color={Colors.accent} />
              <Text style={styles.groupEditBtnText}>Modifica gruppo</Text>
            </TouchableOpacity>
          ) : null}
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
            <MaterialIcons name="edit" size={22} color={Colors.accent} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onDelete(item)} style={styles.actionBtn}>
            <MaterialIcons name="delete-outline" size={26} color={Colors.error} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

type ListItem =
  | { type: "campaign"; data: Campaign }
  | { type: "groupHeader"; groupId: string; baseName: string; count: number; allActive: boolean; someActive: boolean };

function GroupHeader({
  baseName,
  count,
  allActive,
  someActive,
  isCollapsed,
  onToggleCollapse,
  onEdit,
}: {
  baseName: string;
  count: number;
  allActive: boolean;
  someActive: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onEdit: () => void;
}) {
  const dotColor = allActive ? Colors.success : someActive ? Colors.warning : Colors.error;
  return (
    <View style={styles.groupSectionHeader}>
      <TouchableOpacity style={styles.groupSectionLeft} onPress={onToggleCollapse} activeOpacity={0.7}>
        <MaterialIcons
          name={isCollapsed ? "chevron-right" : "expand-more"}
          size={20}
          color={Colors.textSecondary}
        />
        <View style={[styles.groupSectionDot, { backgroundColor: dotColor }]} />
        <Text style={styles.groupSectionName} numberOfLines={1}>{baseName}</Text>
        <Text style={styles.groupSectionCount}> · {count} immagini</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.groupSectionEdit} onPress={onEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <MaterialIcons name="folder-special" size={18} color={Colors.accent} />
      </TouchableOpacity>
    </View>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  const [bulkLinkUrl, setBulkLinkUrl] = useState("");
  const [bulkImages, setBulkImages] = useState<BulkImageAsset[]>([]);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null);

  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [editName, setEditName] = useState("");
  const [editLinkUrl, setEditLinkUrl] = useState("");

  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState("");
  const [editGroupLinkUrl, setEditGroupLinkUrl] = useState("");
  const [editGroupIsActive, setEditGroupIsActive] = useState(true);
  const [editGroupIsActiveDirty, setEditGroupIsActiveDirty] = useState(false);

  const [settingsDuration, setSettingsDuration] = useState("10");
  const [settingsMode, setSettingsMode] = useState<"sequential" | "random">("sequential");

  const { data: allCampaigns = [], isLoading } = useQuery<Campaign[]>({
    queryKey: ["/api/admin/advertisements"],
  });

  const { data: imageHealth } = useQuery<ImageHealthData>({
    queryKey: ["/api/admin/advertisements/image-health"],
    refetchInterval: 60_000,
  });

  const { data: cacheStats } = useQuery<{ count: number; totalBytes: number }>({
    queryKey: ["/api/admin/advertisements/cache-stats"],
    staleTime: 60_000,
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

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // O(n) precomputed group metadata — avoids repeated filter calls in renderItem.
  const groupMeta = useMemo(() => {
    const meta = new Map<string, { baseName: string; count: number; allActive: boolean; someActive: boolean }>();
    for (const campaign of campaigns) {
      if (!campaign.groupId) continue;
      const existing = meta.get(campaign.groupId);
      if (existing) {
        existing.count++;
        if (!campaign.isActive) existing.allActive = false;
        if (campaign.isActive) existing.someActive = true;
      } else {
        meta.set(campaign.groupId, {
          baseName: campaign.name.replace(/\s*#\d+$/, ""),
          count: 1,
          allActive: campaign.isActive,
          someActive: campaign.isActive,
        });
      }
    }
    return meta;
  }, [campaigns]);

  const listItems = useMemo<ListItem[]>(() => {
    const items: ListItem[] = [];
    const seenGroupIds = new Set<string>();
    for (const campaign of campaigns) {
      if (campaign.groupId) {
        if (!seenGroupIds.has(campaign.groupId)) {
          seenGroupIds.add(campaign.groupId);
          const meta = groupMeta.get(campaign.groupId)!;
          items.push({ type: "groupHeader", groupId: campaign.groupId, ...meta });
        }
        if (!collapsedGroups.has(campaign.groupId)) {
          items.push({ type: "campaign", data: campaign });
        }
      } else {
        items.push({ type: "campaign", data: campaign });
      }
    }
    return items;
  }, [campaigns, collapsedGroups, groupMeta]);

  function toggleGroupCollapse(groupId: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

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

  const singleEditMutation = useMutation({
    mutationFn: async ({ id, name, linkUrl }: { id: string; name: string; linkUrl: string }) => {
      const res = await apiRequest("PUT", `/api/admin/advertisements/${id}`, {
        name: name.trim(),
        linkUrl: linkUrl.trim() || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/advertisements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ads/active"] });
      setEditingCampaign(null);
    },
    onError: (err: Error) => Alert.alert("Errore", err.message),
  });

  const groupEditMutation = useMutation({
    mutationFn: async ({ groupId, name, linkUrl, isActive }: { groupId: string; name: string; linkUrl: string; isActive?: boolean }) => {
      const payload: Record<string, unknown> = { name: name.trim(), linkUrl: linkUrl.trim() || null };
      if (typeof isActive === "boolean") payload.isActive = isActive;
      const res = await apiRequest("PUT", `/api/admin/advertisements/group/${groupId}`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/advertisements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ads/active"] });
      setEditingGroupId(null);
    },
    onError: (err: Error) => Alert.alert("Errore", err.message),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiRequest("DELETE", "/api/admin/advertisements/bulk-delete", { ids });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/advertisements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ads/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ads/my-ads"] });
    },
    onError: (err: Error) => Alert.alert("Errore", err.message),
  });

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const onBack = () => {
      if (editingCampaign) { setEditingCampaign(null); return true; }
      if (editingGroupId) { setEditingGroupId(null); return true; }
      if (showCreateModal) { setShowCreateModal(false); resetForm(); return true; }
      if (showBulkModal) { if (!bulkUploading) { setShowBulkModal(false); setBulkBaseName(""); setBulkImages([]); setBulkTarget("tutti"); setBulkLinkUrl(""); } return true; }
      if (showSettingsModal) { setShowSettingsModal(false); return true; }
      return false;
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", onBack);
    return () => sub.remove();
  }, [editingCampaign, editingGroupId, showCreateModal, showBulkModal, showSettingsModal, bulkUploading]);

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
    const totalImages = bulkImages.length;
    setBulkProgress({ current: 0, total: totalImages });
    let created = 0;
    let failed = 0;
    const failedNames: string[] = [];
    const bulkUrl = new URL("/api/admin/advertisements/bulk", getApiUrl()).toString();
    const duration = String(parseInt(bulkDuration) || 10);
    const batchGroupId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
    const CHUNK_SIZE = 10;

    for (let chunkStart = 0; chunkStart < totalImages; chunkStart += CHUNK_SIZE) {
      const chunk = bulkImages.slice(chunkStart, chunkStart + CHUNK_SIZE);
      const formData = new FormData();
      formData.append("baseName", bulkBaseName.trim());
      formData.append("targetUserType", bulkTarget);
      formData.append("displayDuration", duration);
      formData.append("groupId", batchGroupId);
      formData.append("startIndex", String(chunkStart));
      formData.append("totalImages", String(totalImages));
      if (bulkLinkUrl.trim()) formData.append("linkUrl", bulkLinkUrl.trim());
      for (let i = 0; i < chunk.length; i++) {
        const img = chunk[i];
        const filename = img.fileName || img.uri.split("/").pop() || "image.jpg";
        const rawMime = img.mimeType || (() => {
          const m = /\.(\w+)$/.exec(filename);
          return m ? `image/${m[1].toLowerCase()}` : "image/jpeg";
        })();
        const normalised = ["image/jpg", "image/jpe", "image/jfif"].includes(rawMime)
          ? "image/jpeg"
          : rawMime;
        formData.append("images", { uri: img.uri, name: filename, type: normalised } as any);
      }
      try {
        const res = await globalThis.fetch(bulkUrl, {
          method: "POST",
          body: formData,
          credentials: "include",
        });
        if (!res.ok) {
          const text = await res.text();
          failed += chunk.length;
          console.warn(`[bulk] http ${res.status}: ${text}`);
        } else {
          const data: BulkUploadResponse = await res.json();
          created += data.created ?? 0;
          failed += data.failed ?? 0;
          if (data.failedFiles?.length) failedNames.push(...data.failedFiles);
        }
      } catch (err) {
        console.error("[bulk] fetch error:", err);
        failed += chunk.length;
      }
      setBulkProgress({ current: Math.min(chunkStart + CHUNK_SIZE, totalImages), total: totalImages });
    }
    setBulkProgress({ current: totalImages, total: totalImages });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/advertisements"] });
    queryClient.invalidateQueries({ queryKey: ["/api/ads/active"] });
    queryClient.invalidateQueries({ queryKey: ["/api/ads/my-ads"] });
    setBulkUploading(false);
    setBulkProgress(null);
    setShowBulkModal(false);
    setBulkBaseName("");
    setBulkImages([]);
    setBulkTarget("tutti");
    setBulkDuration("10");
    setBulkLinkUrl("");
    const summaryMsg =
      `${created} campagn${created === 1 ? "a" : "e"} creat${created === 1 ? "a" : "e"}` +
      (failed > 0
        ? `, ${failed} fallite${failedNames.length ? `: ${failedNames.slice(0, 3).join(", ")}${failedNames.length > 3 ? `… (+${failedNames.length - 3})` : ""}` : ""}.`
        : ".");
    Alert.alert("Upload completato", summaryMsg);
  }

  function handleDeleteAll() {
    if (campaigns.length === 0) return;
    Alert.alert(
      "Elimina tutte le campagne",
      `Eliminare tutte le ${campaigns.length} campagne visibili nel tab "${TABS.find(t => t.key === activeTab)?.label}"? L'operazione è irreversibile.`,
      [
        { text: "Annulla", style: "cancel" },
        {
          text: `Elimina ${campaigns.length}`,
          style: "destructive",
          onPress: () => bulkDeleteMutation.mutate(campaigns.map((c) => c.id)),
        },
      ]
    );
  }

  function openSingleEdit(campaign: Campaign) {
    setEditName(campaign.name);
    setEditLinkUrl(campaign.linkUrl ?? "");
    setEditingCampaign(campaign);
  }

  function openGroupEdit(groupId: string) {
    const groupCampaigns = campaigns.filter((c) => c.groupId === groupId);
    if (groupCampaigns.length === 0) return;
    const firstName = groupCampaigns[0].name.replace(/\s*#\d+$/, "");
    const firstLink = groupCampaigns[0].linkUrl ?? "";
    const allActive = groupCampaigns.every((c) => c.isActive);
    setEditGroupName(firstName);
    setEditGroupLinkUrl(firstLink);
    setEditGroupIsActive(allActive);
    setEditGroupIsActiveDirty(false);
    setEditingGroupId(groupId);
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
          {cacheStats != null && (
            <Text style={styles.checkedAtText}>
              Cache: {cacheStats.count} {cacheStats.count === 1 ? "immagine" : "immagini"} · {formatBytes(cacheStats.totalBytes)}
            </Text>
          )}
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
          <TouchableOpacity
            onPress={handleDeleteAll}
            disabled={bulkDeleteMutation.isPending || campaigns.length === 0}
            style={styles.toolbarBtn}
          >
            {bulkDeleteMutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.error} />
            ) : (
              <MaterialIcons name="delete-sweep" size={22} color={campaigns.length > 0 ? Colors.error : Colors.textSecondary} />
            )}
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
          data={listItems}
          keyExtractor={(item) => item.type === "groupHeader" ? `group-header-${item.groupId}` : item.data.id}
          renderItem={({ item }) => {
            if (item.type === "groupHeader") {
              return (
                <GroupHeader
                  baseName={item.baseName}
                  count={item.count}
                  allActive={item.allActive}
                  someActive={item.someActive}
                  isCollapsed={collapsedGroups.has(item.groupId)}
                  onToggleCollapse={() => toggleGroupCollapse(item.groupId)}
                  onEdit={() => openGroupEdit(item.groupId)}
                />
              );
            }
            const campaign = item.data;
            return (
              <CampaignCard
                item={campaign}
                onToggle={(id, isActive) => toggleMutation.mutate({ id, isActive })}
                onDelete={handleDelete}
                onEdit={openSingleEdit}
                onEditGroup={campaign.groupId ? () => openGroupEdit(campaign.groupId!) : undefined}
                groupCount={campaign.groupId ? groupMeta.get(campaign.groupId)?.count : undefined}
                isBroken={brokenIdSet.has(campaign.id)}
              />
            );
          }}
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

      <Modal visible={showCreateModal} animationType="slide" onRequestClose={() => { setShowCreateModal(false); resetForm(); }}>
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

      <Modal visible={showBulkModal} animationType="slide" onRequestClose={() => { if (!bulkUploading) { setShowBulkModal(false); setBulkBaseName(""); setBulkImages([]); setBulkTarget("tutti"); setBulkLinkUrl(""); } }}>
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

            <Text style={styles.settingsLabel}>Link URL (opzionale)</Text>
            <TextInput
              style={[styles.input, { marginBottom: 12 }]}
              placeholder="https://..."
              placeholderTextColor={Colors.textSecondary}
              value={bulkLinkUrl}
              onChangeText={setBulkLinkUrl}
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!bulkUploading}
            />

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

            {bulkProgress && (
              <View style={styles.progressContainer}>
                <View style={styles.progressBar}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${Math.round((bulkProgress.current / bulkProgress.total) * 100)}%` as any },
                    ]}
                  />
                </View>
                <Text style={styles.progressText}>
                  {bulkProgress.current}/{bulkProgress.total} campagne create…
                </Text>
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

      <Modal
        visible={!!editingCampaign}
        animationType="fade"
        transparent
        onRequestClose={() => setEditingCampaign(null)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          <View style={styles.overlayBg}>
            <View style={styles.overlayCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Modifica Campagna</Text>
                <TouchableOpacity onPress={() => setEditingCampaign(null)}>
                  <MaterialIcons name="close" size={22} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <Text style={styles.settingsLabel}>Nome</Text>
              <TextInput
                style={[styles.input, { marginBottom: 12 }]}
                placeholder="Nome campagna"
                placeholderTextColor={Colors.textSecondary}
                value={editName}
                onChangeText={setEditName}
                autoFocus
              />
              <Text style={styles.settingsLabel}>Link URL (opzionale)</Text>
              <TextInput
                style={[styles.input, { marginBottom: 20 }]}
                placeholder="https://..."
                placeholderTextColor={Colors.textSecondary}
                value={editLinkUrl}
                onChangeText={setEditLinkUrl}
                keyboardType="url"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={[styles.submitBtn, { opacity: (!editName.trim() || singleEditMutation.isPending) ? 0.4 : 1 }]}
                onPress={() => { if (editingCampaign && editName.trim()) singleEditMutation.mutate({ id: editingCampaign.id, name: editName, linkUrl: editLinkUrl }); }}
                disabled={!editName.trim() || singleEditMutation.isPending}
              >
                {singleEditMutation.isPending ? (
                  <ActivityIndicator color={Colors.background} />
                ) : (
                  <Text style={styles.submitBtnText}>Salva</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={!!editingGroupId}
        animationType="fade"
        transparent
        onRequestClose={() => setEditingGroupId(null)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          <View style={styles.overlayBg}>
            <View style={styles.overlayCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Modifica Gruppo</Text>
                <TouchableOpacity onPress={() => setEditingGroupId(null)}>
                  <MaterialIcons name="close" size={22} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <Text style={[styles.cardDesc, { marginBottom: 12 }]}>
                Rinomina, aggiorna il link e attiva/disattiva tutte le campagne del gruppo in una volta. I numeri (#1, #2...) vengono aggiunti automaticamente.
              </Text>
              <Text style={styles.settingsLabel}>Nome base gruppo</Text>
              <TextInput
                style={[styles.input, { marginBottom: 12 }]}
                placeholder="Nome base (es. Estate 2026)"
                placeholderTextColor={Colors.textSecondary}
                value={editGroupName}
                onChangeText={setEditGroupName}
                autoFocus
              />
              <Text style={styles.settingsLabel}>Link URL (opzionale)</Text>
              <TextInput
                style={[styles.input, { marginBottom: 16 }]}
                placeholder="https://..."
                placeholderTextColor={Colors.textSecondary}
                value={editGroupLinkUrl}
                onChangeText={setEditGroupLinkUrl}
                keyboardType="url"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <View style={styles.toggleRow}>
                <Text style={styles.settingsLabel}>Attiva tutte le campagne del gruppo</Text>
                <Switch
                  value={editGroupIsActive}
                  onValueChange={(v) => { setEditGroupIsActive(v); setEditGroupIsActiveDirty(true); }}
                  trackColor={{ false: Colors.surface, true: Colors.accent }}
                  thumbColor="#fff"
                />
              </View>
              <TouchableOpacity
                style={[styles.submitBtn, { opacity: (!editGroupName.trim() || groupEditMutation.isPending) ? 0.4 : 1, marginTop: 20 }]}
                onPress={() => { if (editingGroupId && editGroupName.trim()) groupEditMutation.mutate({ groupId: editingGroupId, name: editGroupName, linkUrl: editGroupLinkUrl, isActive: editGroupIsActiveDirty ? editGroupIsActive : undefined }); }}
                disabled={!editGroupName.trim() || groupEditMutation.isPending}
              >
                {groupEditMutation.isPending ? (
                  <ActivityIndicator color={Colors.background} />
                ) : (
                  <Text style={styles.submitBtnText}>Salva Gruppo</Text>
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
  fabDeleteAll: {
    right: 152,
    backgroundColor: Colors.error,
  },
  groupEditBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
    alignSelf: "flex-start",
  },
  groupEditBtnText: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: Colors.accent,
  },
  groupSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 20,
    paddingBottom: 6,
    paddingHorizontal: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.surface,
    marginBottom: 4,
  },
  groupSectionLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 6,
  },
  groupSectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  groupSectionName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.text,
    flex: 1,
  },
  groupSectionCount: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  groupSectionEdit: {
    padding: 4,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  overlayBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  overlayCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    width: "100%",
    maxWidth: 400,
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
  progressContainer: {
    marginBottom: 12,
    gap: 6,
  },
  progressBar: {
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: Colors.accent,
    borderRadius: 3,
  },
  progressText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: "center",
  },
});
