// LARGE-FILE-LOCKED — limite: 587
// Aggiungi nuove funzionalità in: components/admin/ads/useAdAdmin.next.ts
import { useAdAdminStats } from "./useAdAdmin.stats";
import { useAdRotationSettings } from "./useAdAdmin.next";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Alert, BackHandler, Platform } from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getApiUrl } from "@/lib/query-client";
import { useT } from "@/lib/language-context";
import { showImagePickerMenu, pickMultipleImages, BulkImageAsset, appendFileToForm } from "@/lib/image-picker-utils";
import { Campaign } from "./AdCard";
import { ListItem } from "./AdGroupList";
import { confirmDeleteSingle, useAdAdminInternal, handleBulkCreateInternal, useAdAdminMutations } from "./useAdAdmin.part2";

type TabKey = "biker" | "zavorrina" | "coppia" | "tutti";


export function useAdAdmin() {
  const t = useT();
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

  const { settingsDuration, setSettingsDuration, settingsMode, setSettingsMode,
    serverDuration, saveRotationSettings, initFromServer } = useAdRotationSettings();

  const { data: allCampaigns = [], isLoading, error: campaignsError } = useQuery<Campaign[]>({
    queryKey: ["/api/admin/advertisements"],
  });

  const { imageHealth, cacheStats, healthBannerDismissed, setHealthBannerDismissed, handleCheckImages } = useAdAdminStats();
  const campaigns = activeTab === "tutti" ? allCampaigns : allCampaigns.filter((c) => c.targetUserType === activeTab);
  const brokenIdSet = new Set<string>([...(imageHealth?.brokenIds ?? []), ...allCampaigns.filter((c) => c.imageHealthy === false).map((c) => c.id)]);
  const brokenInView = campaigns.filter((c) => brokenIdSet.has(c.id));

  const reuploadMutation = useMutation({
    mutationFn: async ({ id, imageUri, mimeType, filename }: { id: string; imageUri: string; mimeType: string; filename: string }) => {
      const formData = new FormData();
      await appendFileToForm(formData, "image", imageUri, mimeType, filename);
      const baseUrl = getApiUrl();
      const url = new URL(`/api/admin/advertisements/${id}/reupload-image`, baseUrl);
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
      queryClient.invalidateQueries({ queryKey: ["/api/admin/advertisements/image-health"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ads/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ads/my-ads"] });
    },
    onError: (err: Error) => Alert.alert("Errore re-upload", err.message),
  });

  const handleReuploadImage = useCallback((campaign: Campaign) => {
    showImagePickerMenu(
      (uri) => {
        const filename = uri.split("/").pop() || "image.jpg";
        const match = /\.(\w+)$/.exec(filename);
        const rawMime = match ? `image/${match[1].toLowerCase()}` : "image/jpeg";
        const mimeType = ["image/jpg", "image/jpe"].includes(rawMime) ? "image/jpeg" : rawMime;
        reuploadMutation.mutate({ id: campaign.id, imageUri: uri, mimeType, filename });
      },
      { quality: 0.8, aspect: [16, 11] }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

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

  const listItems = useMemo((): ListItem[] => {
    const items: ListItem[] = [];
    const seenGroups = new Set<string>();
    for (const campaign of campaigns) {
      if (campaign.groupId) {
        if (!seenGroups.has(campaign.groupId)) {
          seenGroups.add(campaign.groupId);
          const meta = groupMeta.get(campaign.groupId);
          if (meta) {
            items.push({ type: "groupHeader", groupId: campaign.groupId, ...meta });
          }
        }
        if (!collapsedGroups.has(campaign.groupId)) {
          items.push({ type: "campaign", data: campaign });
        }
      } else {
        items.push({ type: "campaign", data: campaign });
      }
    }
    return items;
  }, [campaigns, groupMeta, collapsedGroups]);

  function toggleGroupCollapse(groupId: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  const {
    createMutation,
    toggleMutation,
    deleteMutation,
    updateRotationMutation,
    singleEditMutation,
    groupEditMutation,
    groupToggleMutation,
    bulkDeleteMutation,
  } = useAdAdminMutations();

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

  const handleRestartAll = async () => {
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
  };

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

  const handlePickBulkImages = async () => {
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
        `${skipped} ${skipped === 1 ? t("admin.imagesSkippedSingular") : t("admin.imagesSkippedPlural")} il limite di 5 MB.`
      );
    }
  };

  const handleBulkCreate = () => handleBulkCreateInternal(
    bulkBaseName,
    bulkImages,
    bulkUploading,
    setBulkUploading,
    setBulkProgress,
    bulkDuration,
    bulkTarget,
    bulkLinkUrl,
    setShowBulkModal,
    setBulkBaseName,
    setBulkImages,
    setBulkTarget as (val: string) => void,
    setBulkDuration,
    setBulkLinkUrl,
  );

  const { handleDeleteAll, openSingleEdit, openGroupEdit } = useAdAdminInternal(
    campaigns,
    activeTab,
    t,
    bulkDeleteMutation,
    setEditName,
    setEditLinkUrl,
    setEditingCampaign,
    setEditGroupName,
    setEditGroupLinkUrl,
    setEditGroupIsActive,
    setEditGroupIsActiveDirty,
    setEditingGroupId,
  );

  const handleCreate = async () => {
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
      const mimeType = match ? `image/${match[1]}` : "image/jpeg";
      await appendFileToForm(formData, "image", formImageUri, mimeType, filename);
    }
    createMutation.mutate(formData);
  };

  const handleDelete = (campaign: Campaign) => {
    confirmDeleteSingle(campaign, t, () => deleteMutation.mutate(campaign.id));
  };

  const openRotationSettings = () => {
    initFromServer();
    setShowSettingsModal(true);
  };

  const openBulkModal = () => {
    setBulkDuration(String(serverDuration || 10));
    setShowBulkModal(true);
  };

  const handleSaveRotation = () => {
    const duration = parseInt(settingsDuration) || 10;
    const ids = allCampaigns.map((c) => c.id);
    if (ids.length === 0) {
      saveRotationSettings(duration, settingsMode);
      setShowSettingsModal(false);
      return;
    }
    updateRotationMutation.mutate({ ids, rotationDuration: duration, rotationMode: settingsMode });
  };

  return {
    activeTab, setActiveTab,
    showCreateModal, setShowCreateModal,
    showSettingsModal, setShowSettingsModal,
    isRestartingAll,
    formName, setFormName,
    formLinkUrl, setFormLinkUrl,
    formDescription, setFormDescription,
    formImageUri, setFormImageUri,
    showBulkModal, setShowBulkModal,
    bulkBaseName, setBulkBaseName,
    bulkTarget, setBulkTarget,
    bulkDuration, setBulkDuration,
    bulkLinkUrl, setBulkLinkUrl,
    bulkImages, setBulkImages,
    bulkUploading,
    bulkProgress,
    editingCampaign, setEditingCampaign,
    editName, setEditName,
    editLinkUrl, setEditLinkUrl,
    editingGroupId, setEditingGroupId,
    editGroupName, setEditGroupName,
    editGroupLinkUrl, setEditGroupLinkUrl,
    editGroupIsActive, setEditGroupIsActive,
    editGroupIsActiveDirty, setEditGroupIsActiveDirty,
    settingsDuration, setSettingsDuration,
    settingsMode, setSettingsMode,
    campaigns,
    isLoading,
    campaignsError,
    cacheStats,
    healthBannerDismissed, setHealthBannerDismissed,
    brokenInView,
    brokenIdSet,
    collapsedGroups,
    listItems,
    toggleGroupCollapse,
    handleRestartAll,
    handleCheckImages,
    handleDeleteAll,
    handlePickBulkImages,
    handleBulkCreate,
    handleCreate,
    handleDelete,
    openSingleEdit,
    openGroupEdit,
    openRotationSettings,
    openBulkModal,
    handleSaveRotation,
    createMutation,
    singleEditMutation,
    groupEditMutation,
    groupToggleMutation,
    bulkDeleteMutation,
    updateRotationMutation,
    toggleMutation,
    resetForm,
    pickImage,
    handleReuploadImage,
    reuploadMutation,
  };
}
