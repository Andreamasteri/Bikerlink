/* eslint-disable @typescript-eslint/no-explicit-any */

export function useAdRotationLogic(allCampaigns: any[], settingsDuration: string, settingsMode: any, setShowSettingsModal: any, updateRotationMutation: any, saveRotationSettings: any) {
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

  return { handleSaveRotation };
}

export function useAdFormLogic(activeTab: any, t: any, formName: string, formImageUri: string | null, formLinkUrl: string, formDescription: string, createMutation: any, appendFileToForm: any) {
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

  return { handleCreate };
}
