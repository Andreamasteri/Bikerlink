// LARGE-FILE-LOCKED — limite: 587
// Aggiungi nuove funzionalità in: components/admin/ads/useAdAdmin.next.ts
import { useAdAdminStats } from "./useAdAdmin.stats";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Alert, BackHandler, Platform } from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getApiUrl } from "@/lib/query-client";
import { useT } from "@/lib/language-context";
import { showImagePickerMenu, pickMultipleImages, BulkImageAsset, appendFileToForm } from "@/lib/image-picker-utils";
import { Campaign } from "./AdCard";
import { ListItem } from "./AdGroupList";

type TabKey = "biker" | "zavorrina" | "coppia" | "tutti";

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

  const [settingsDuration, setSettingsDuration] = useState("10");
  const [settingsMode, setSettingsMode] = useState<"sequential" | "random">("sequential");

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
      Alert.alert("Errore", (err as Error).message);
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
    onError: (err: Error) => Alert.alert("Errore", (err as Error).message),
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
    onError: (err: Error) => Alert.alert("Errore", (err as Error).message),
  });

  const groupToggleMutation = useMutation({
    mutationFn: async ({ groupId, isActive }: { groupId: string; isActive: boolean }) => {
      const res = await apiRequest("PUT", `/api/admin/advertisements/group/${groupId}`, { isActive });
      return res.json();
    },
    onMutate: async ({ groupId, isActive }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/admin/advertisements"] });
      const previous = queryClient.getQueryData<Campaign[]>(["/api/admin/advertisements"]);
      queryClient.setQueryData<Campaign[]>(["/api/admin/advertisements"], (old) =>
        old ? old.map((c) => c.groupId === groupId ? { ...c, isActive } : c) : old
      );
      return { previous };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- optimistic update context
    onError: (_err: Error, _vars, context: any) => {
      if (context?.previous) {
        queryClient.setQueryData(["/api/admin/advertisements"], context.previous);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/advertisements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ads/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ads/my-ads"] });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/advertisements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ads/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ads/my-ads"] });
    },
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
    onError: (err: Error) => Alert.alert("Errore", (err as Error).message),
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

  const handleBulkCreate = async () => {
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
        await appendFileToForm(formData, "images", img.uri, normalised, filename);
      }
      try {
        const res = await globalThis.fetch(bulkUrl, {
          method: "POST",
          body: formData,
          credentials: "include",
        });
        if (!res.ok) {
          failed += chunk.length;
        } else {
          const data: BulkUploadResponse = await res.json();
          created += data.created ?? 0;
          failed += data.failed ?? 0;
          if (data.failedFiles?.length) failedNames.push(...data.failedFiles);
        }
      } catch {
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
  };

  const handleDeleteAll = () => {
    if (campaigns.length === 0) return;
    Alert.alert(
      t("admin.deleteAllCampaigns"),
      t("admin.deleteCampaignsConfirm").replace("{count}", String(campaigns.length)).replace("{tab}", activeTab),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("admin.deleteCampaignsBtn").replace("{count}", String(campaigns.length)),
          style: "destructive",
          onPress: () => bulkDeleteMutation.mutate(campaigns.map((c) => c.id)),
        },
      ]
    );
  };

  const openSingleEdit = (campaign: Campaign) => {
    setEditName(campaign.name);
    setEditLinkUrl(campaign.linkUrl ?? "");
    setEditingCampaign(campaign);
  };

  const openGroupEdit = (groupId: string) => {
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
  };

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
    Alert.alert(t("admin.deleteCampaignTitle"), `Eliminare "${campaign.name}"?`, [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.delete"), style: "destructive", onPress: () => deleteMutation.mutate(campaign.id) },
    ]);
  };

  const openRotationSettings = () => {
    const firstCampaign = campaigns[0];
    if (firstCampaign) {
      setSettingsDuration(String(firstCampaign.rotationDuration));
      setSettingsMode(firstCampaign.rotationMode as "sequential" | "random");
    } else {
      setSettingsDuration("10");
      setSettingsMode("sequential");
    }
    setShowSettingsModal(true);
  };

  const handleSaveRotation = () => {
    const duration = parseInt(settingsDuration) || 10;
    const ids = campaigns.map((c) => c.id);
    if (ids.length === 0) {
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
