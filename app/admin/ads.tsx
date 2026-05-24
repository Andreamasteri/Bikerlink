import React, { useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  Platform,
} from "react-native";
import { KeyboardAvoidingView } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { queryClient } from "@/lib/query-client";

import { AdForm } from "@/components/admin/ads/AdForm";
import { AdGroupList } from "@/components/admin/ads/AdGroupList";
import { BulkUploadSection } from "@/components/admin/ads/BulkUploadSection";
import { AdRotationSection } from "@/components/admin/ads/AdRotationSection";
import { CreateAdModal } from "@/components/admin/ads/CreateAdModal";
import { useAdAdmin } from "@/components/admin/ads/useAdAdmin";
import { AdTabs, AdHealthBanner, AdToolbar } from "@/components/admin/ads/AdLayoutComponents";
import { ErrorBoundary } from "@/components/ErrorBoundary";

type TabKey = "biker" | "zavorrina" | "coppia" | "tutti";

const TABS: { key: TabKey; label: string; icon: string; iconSet: "material" | "community" | "ionicons"; color: string }[] = [
  { key: "tutti", label: "Tutti", icon: "people-outline", iconSet: "ionicons", color: Colors.textSecondary },
  { key: "biker", label: "Biker", icon: "motorcycle", iconSet: "material", color: Colors.accent },
  { key: "zavorrina", label: "Zavorrine", icon: "seat-passenger", iconSet: "community", color: Colors.femaleIcon },
  { key: "coppia", label: "Coppie", icon: "people", iconSet: "material", color: Colors.coupleIcon },
];

function AdminAdsInner() {
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);
  
  const {
    activeTab, setActiveTab,
    showCreateModal, setShowCreateModal,
    showSettingsModal, setShowSettingsModal,
    isRestartingAll,
    formName, setFormName,
    formLinkUrl, setFormLinkUrl,
    formDescription, setFormDescription,
    formImageUri,
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
  } = useAdAdmin();

  const currentTab = TABS.find((t) => t.key === activeTab)!;

  return (
    <View style={styles.container}>
      <AdTabs tabs={TABS} activeTab={activeTab} onTabPress={setActiveTab} />

      {campaignsError && (
        <View style={styles.errorBanner}>
          <MaterialIcons name="error-outline" size={16} color={Colors.error} />
          <Text style={styles.errorBannerText} numberOfLines={3}>
            {(campaignsError as Error)?.message
              ? `Impossibile caricare le campagne: ${(campaignsError as Error).message}`
              : "Impossibile caricare le campagne. Controlla la connessione e riprova."}
          </Text>
          <TouchableOpacity
            onPress={() => queryClient.invalidateQueries({ queryKey: ["/api/admin/advertisements"] })}
            style={styles.errorBannerRetry}
          >
            <MaterialIcons name="refresh" size={16} color={Colors.error} />
          </TouchableOpacity>
        </View>
      )}

      {brokenInView.length > 0 && !healthBannerDismissed && (
        <AdHealthBanner brokenCount={brokenInView.length} onDismiss={() => setHealthBannerDismissed(true)} />
      )}

      <AdToolbar
        campaignCount={campaigns.length}
        cacheStats={cacheStats}
        onRestartAll={handleRestartAll}
        isRestartingAll={isRestartingAll}
        activeCampaignCount={campaigns.filter((c) => c.isActive).length}
        onRefresh={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/admin/advertisements"] });
          handleCheckImages();
          setHealthBannerDismissed(false);
        }}
        onDeleteAll={handleDeleteAll}
        isDeletingAll={bulkDeleteMutation.isPending}
        onOpenSettings={openRotationSettings}
      />

      <AdGroupList
        listItems={listItems}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- FlatList ref type
        flatListRef={flatListRef as any}
        isLoading={isLoading}
        collapsedGroups={collapsedGroups}
        onToggleGroupCollapse={toggleGroupCollapse}
        onEditGroup={openGroupEdit}
        onToggleGroupStatus={(groupId, isActive) => groupToggleMutation.mutate({ groupId, isActive })}
        onEditCampaign={openSingleEdit}
        onToggleCampaign={(id, isActive) => toggleMutation.mutate({ id, isActive })}
        onDeleteCampaign={handleDelete}
        onRefresh={() => queryClient.invalidateQueries({ queryKey: ["/api/admin/advertisements"] })}
        isRefreshing={isLoading}
      />

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

      <CreateAdModal
        visible={showCreateModal}
        onClose={() => { setShowCreateModal(false); resetForm(); }}
        title={`Nuova Campagna — ${currentTab.label}`}
        imageUri={formImageUri}
        onPickImage={pickImage}
        name={formName}
        onNameChange={setFormName}
        linkUrl={formLinkUrl}
        onLinkUrlChange={setFormLinkUrl}
        description={formDescription}
        onDescriptionChange={setFormDescription}
        onSubmit={handleCreate}
        isPending={createMutation.isPending}
        insets={insets}
      />

      <Modal visible={showBulkModal} animationType="slide" onRequestClose={() => { if (!bulkUploading) { setShowBulkModal(false); setBulkBaseName(""); setBulkImages([]); setBulkTarget("tutti"); setBulkLinkUrl(""); } }}>
        <View style={[styles.createModalContainer, { paddingTop: insets.top, paddingBottom: insets.bottom + 20 }]}>
          <BulkUploadSection
            bulkBaseName={bulkBaseName}
            onBulkBaseNameChange={setBulkBaseName}
            bulkTarget={bulkTarget}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- bulk target matches enum at runtime
            onBulkTargetChange={(target) => setBulkTarget(target as any)}
            bulkDuration={bulkDuration}
            onBulkDurationChange={setBulkDuration}
            bulkLinkUrl={bulkLinkUrl}
            onBulkLinkUrlChange={setBulkLinkUrl}
            bulkImages={bulkImages}
            onPickImages={handlePickBulkImages}
            onRemoveImage={(idx) => setBulkImages(prev => prev.filter((_, i) => i !== idx))}
            onSubmit={handleBulkCreate}
            onCancel={() => { setShowBulkModal(false); setBulkBaseName(""); setBulkImages([]); }}
            isUploading={bulkUploading}
            progress={bulkProgress}
            tabs={TABS}
          />
        </View>
      </Modal>

      <Modal visible={showSettingsModal} animationType="fade" transparent onRequestClose={() => setShowSettingsModal(false)}>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={[styles.settingsContent, { paddingBottom: insets.bottom + 20 }]}>
              <AdRotationSection
                duration={settingsDuration}
                onDurationChange={setSettingsDuration}
                mode={settingsMode}
                onModeChange={setSettingsMode}
                onSave={handleSaveRotation}
                onCancel={() => setShowSettingsModal(false)}
                isPending={updateRotationMutation.isPending}
              />
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
            <AdForm
              title="Modifica Campagna"
              name={editName}
              onNameChange={setEditName}
              linkUrl={editLinkUrl}
              onLinkUrlChange={setEditLinkUrl}
              submitLabel="Salva"
              isPending={singleEditMutation.isPending}
              onCancel={() => setEditingCampaign(null)}
              onSubmit={() => { if (editingCampaign && editName.trim()) singleEditMutation.mutate({ id: editingCampaign.id, name: editName, linkUrl: editLinkUrl }); }}
            />
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
            <AdForm
              title="Modifica Gruppo"
              name={editGroupName}
              onNameChange={setEditGroupName}
              linkUrl={editGroupLinkUrl}
              onLinkUrlChange={setEditGroupLinkUrl}
              isActive={editGroupIsActive}
              onIsActiveChange={(v) => { setEditGroupIsActive(v); setEditGroupIsActiveDirty(true); }}
              submitLabel="Salva Gruppo"
              isPending={groupEditMutation.isPending}
              onCancel={() => setEditingGroupId(null)}
              onSubmit={() => { if (editingGroupId && editGroupName.trim()) groupEditMutation.mutate({ groupId: editingGroupId, name: editGroupName, linkUrl: editGroupLinkUrl, isActive: editGroupIsActiveDirty ? editGroupIsActive : undefined }); }}
              isGroup
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

export default function AdminAds() {
  return (
    <ErrorBoundary>
      <AdminAdsInner />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.error + "18",
    borderBottomWidth: 1,
    borderBottomColor: Colors.error + "44",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  errorBannerText: {
    flex: 1,
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.error,
  },
  errorBannerRetry: {
    padding: 2,
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
  fabFolder: {
    right: 88,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
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
  settingsContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: "60%",
  },
  overlayBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
});
