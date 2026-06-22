/* eslint-disable @typescript-eslint/no-explicit-any */
import { Alert } from "react-native";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getApiUrl } from "@/lib/query-client";
import { appendFileToForm } from "@/lib/image-picker-utils";
import { Campaign } from "./AdCard";

export interface BulkUploadResponse {
  created: number;
  failed: number;
  campaigns: { id: string; name: string; imageUrl: string | null; isActive: boolean }[];
  failedFiles: string[];
}

export function handleBulkSummary(created: number, failed: number, failedNames: string[]) {
  const summaryMsg =
    `${created} campagn${created === 1 ? "a" : "e"} creat${created === 1 ? "a" : "e"}` +
    (failed > 0
      ? `, ${failed} fallite${failedNames.length ? `: ${failedNames.slice(0, 3).join(", ")}${failedNames.length > 3 ? `… (+${failedNames.length - 3})` : ""}` : ""}.`
      : ".");
  Alert.alert("Upload completato", summaryMsg);
}

export function confirmDeleteAll(count: number, tab: string, t: any, onConfirm: () => void) {
  Alert.alert(
    t("admin.deleteAllCampaigns"),
    t("admin.deleteCampaignsConfirm").replace("{count}", String(count)).replace("{tab}", tab),
    [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("admin.deleteCampaignsBtn").replace("{count}", String(count)),
        style: "destructive",
        onPress: onConfirm,
      },
    ]
  );
}

export function confirmDeleteSingle(campaign: Campaign, t: any, onConfirm: () => void) {
  Alert.alert(t("admin.deleteCampaignTitle"), `Eliminare "${campaign.name}"?`, [
    { text: t("common.cancel"), style: "cancel" },
    { text: t("common.delete"), style: "destructive", onPress: onConfirm },
  ]);
}

export const useAdAdminInternal = (
  campaigns: Campaign[],
  activeTab: string,
  t: any,
  bulkDeleteMutation: any,
  setEditName: (val: string) => void,
  setEditLinkUrl: (val: string) => void,
  setEditingCampaign: (val: Campaign | null) => void,
  setEditGroupName: (val: string) => void,
  setEditGroupLinkUrl: (val: string) => void,
  setEditGroupIsActive: (val: boolean) => void,
  setEditGroupIsActiveDirty: (val: boolean) => void,
  setEditingGroupId: (val: string | null) => void,
) => {
  const handleDeleteAll = () => {
    if (campaigns.length === 0) return;
    confirmDeleteAll(campaigns.length, activeTab, t, () => bulkDeleteMutation.mutate(campaigns.map((c) => c.id)));
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

  return {
    handleDeleteAll,
    openSingleEdit,
    openGroupEdit,
  };
};

export const useAdAdminMutations = () => {
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

  return {
    createMutation,
    toggleMutation,
    deleteMutation,
    updateRotationMutation,
    singleEditMutation,
    groupEditMutation,
    groupToggleMutation,
    bulkDeleteMutation,
  };
};

export const handleBulkCreateInternal = async (
  bulkBaseName: string,
  bulkImages: any[],
  bulkUploading: boolean,
  setBulkUploading: (val: boolean) => void,
  setBulkProgress: (val: { current: number; total: number } | null) => void,
  bulkDuration: string,
  bulkTarget: string,
  bulkLinkUrl: string,
  setShowBulkModal: (val: boolean) => void,
  setBulkBaseName: (val: string) => void,
  setBulkImages: (val: any[]) => void,
  setBulkTarget: (val: string) => void,
  setBulkDuration: (val: string) => void,
  setBulkLinkUrl: (val: string) => void,
) => {
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
  setBulkTarget("tutti" as any);
  setBulkDuration("10");
  setBulkLinkUrl("");
  handleBulkSummary(created, failed, failedNames);
};
