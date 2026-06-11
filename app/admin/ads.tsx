import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  Platform,
  ScrollView,
} from "react-native";
import { styles } from "@/app/admin/ads-styles";
import { KeyboardAvoidingView } from "react-native";
import { MaterialIcons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { queryClient, apiRequest } from "@/lib/query-client";
import { copyLogToClipboard } from "@/lib/copyAdminLog";

interface SelfCheckEntry { name: string; status: "ok" | "warn" | "error"; durationMs: number; message?: string }
interface SelfCheckResult {
  overall: "ok" | "degraded" | "broken";
  checks: SelfCheckEntry[];
  summary: string;
  suggestedFix: string | null;
  generatedAt: string;
  durationMs: number;
  triggeredBy: "manual" | "scheduler" | "startup";
  aiBrief?: string;
  aiMeta?: { provider: string; model: string };
}

function overallColor(overall: SelfCheckResult["overall"]): string {
  if (overall === "ok") return Colors.success;
  if (overall === "degraded") return Colors.warning;
  return Colors.error;
}

function overallLabel(overall: SelfCheckResult["overall"]): string {
  if (overall === "ok") return "OK";
  if (overall === "degraded") return "DEGRADED";
  return "BROKEN";
}

import { AdForm } from "@/components/admin/ads/AdForm";
import { AdGroupList } from "@/components/admin/ads/AdGroupList";
import { BulkUploadSection } from "@/components/admin/ads/BulkUploadSection";
import { AdRotationSection } from "@/components/admin/ads/AdRotationSection";
import { CreateAdModal } from "@/components/admin/ads/CreateAdModal";
import { useAdAdmin } from "@/components/admin/ads/useAdAdmin";
import { AdTabs, AdHealthBanner, AdToolbar } from "@/components/admin/ads/AdLayoutComponents";
import { AdsControlPanel } from "@/components/admin/ads/AdsControlPanel";
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
    handleReuploadImage,
    brokenIdSet,
  } = useAdAdmin();

  const currentTab = TABS.find((t) => t.key === activeTab)!;

  const [selfCheckResult, setSelfCheckResult] = useState<SelfCheckResult | null>(null);
  const [showSelfCheckModal, setShowSelfCheckModal] = useState(false);
  const [lastFetched, setLastFetched] = useState(false);
  const [scCopied, setScCopied] = useState(false);
  const selfCheckMutation = useMutation<SelfCheckResult>({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/advertisements/self-check", { withAi: true });
      return (await res.json()) as SelfCheckResult;
    },
    onSuccess: (data) => {
      setSelfCheckResult(data);
      setShowSelfCheckModal(true);
    },
    onError: (err: Error) => {
      setSelfCheckResult({
        overall: "broken",
        checks: [{ name: "richiesta", status: "error", durationMs: 0, message: err?.message ?? "errore di rete" }],
        summary: `Impossibile contattare il self-check: ${err?.message ?? "errore di rete"}.`,
        suggestedFix: "Verifica che il backend sia attivo e raggiungibile.",
        generatedAt: new Date().toISOString(),
        durationMs: 0,
        triggeredBy: "manual",
      });
      setShowSelfCheckModal(true);
    },
  });

  // Task #2694 — quando si apre il modal, mostra subito l'ultimo report del
  // watchdog (se presente) senza forzare un rerun. L'utente può poi cliccare
  // "Riesegui" per un check immediato.
  const openSelfCheckModal = async () => {
    setShowSelfCheckModal(true);
    setLastFetched(true);
    try {
      const res = await apiRequest("GET", "/api/admin/advertisements/self-check/last");
      const data = (await res.json()) as { result: SelfCheckResult | null };
      if (data.result) setSelfCheckResult(data.result);
    } catch {/* best-effort */}
  };
  useEffect(() => {
    // Pre-warm: prova a leggere lo storage al mount, senza aprire il modal.
    if (lastFetched) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiRequest("GET", "/api/admin/advertisements/self-check/last");
        const data = (await res.json()) as { result: SelfCheckResult | null };
        if (!cancelled && data.result) setSelfCheckResult(data.result);
      } catch {/* ignore */}
    })();
    return () => { cancelled = true; };
  }, [lastFetched]);

  return (
    <View style={styles.container}>
      <AdsControlPanel />

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
        onSelfCheck={() => { void openSelfCheckModal(); }}
        isSelfChecking={selfCheckMutation.isPending}
      />

      <Modal
        visible={showSelfCheckModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowSelfCheckModal(false)}
      >
        <View style={styles.scModalBackdrop}>
          <View style={styles.scModalCard}>
            <View style={styles.scModalHeader}>
              <MaterialCommunityIcons
                name="robot-outline"
                size={20}
                color={selfCheckResult ? overallColor(selfCheckResult.overall) : Colors.textSecondary}
              />
              <Text style={styles.scModalTitle}>Verifica con AI — Campagne</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                {selfCheckResult && (
                  <TouchableOpacity
                    onPress={async () => {
                      const ok = await copyLogToClipboard({
                        title: "Verifica con AI — Campagne",
                        overall: overallLabel(selfCheckResult.overall),
                        durationMs: selfCheckResult.durationMs,
                        triggeredBy: selfCheckResult.triggeredBy,
                        summary: selfCheckResult.summary,
                        suggestedFix: selfCheckResult.suggestedFix,
                        aiBrief: selfCheckResult.aiBrief,
                        aiMeta: selfCheckResult.aiMeta,
                        checks: selfCheckResult.checks,
                      });
                      if (ok) {
                        setScCopied(true);
                        setTimeout(() => setScCopied(false), 2000);
                      }
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <MaterialIcons name="content-copy" size={20} color={Colors.textSecondary} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setShowSelfCheckModal(false)}>
                  <MaterialIcons name="close" size={22} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>
            {scCopied && (
              <Text style={styles.scCopiedHint}>Copiato!</Text>
            )}
            <ScrollView style={styles.scModalBody}>
              {selfCheckResult ? (
                <>
                  <Text style={styles.scStatusLine}>
                    Esito: <Text style={{ fontFamily: "Inter_700Bold", color: overallColor(selfCheckResult.overall) }}>{overallLabel(selfCheckResult.overall)}</Text>
                    {" "}({selfCheckResult.durationMs}ms · trigger={selfCheckResult.triggeredBy})
                  </Text>
                  <Text style={styles.scSummary}>{selfCheckResult.summary}</Text>
                  {selfCheckResult.suggestedFix ? (
                    <View style={styles.scFixBox}>
                      <Text style={styles.scFixLabel}>Suggerimento:</Text>
                      <Text style={styles.scFixText}>{selfCheckResult.suggestedFix}</Text>
                    </View>
                  ) : null}
                  {selfCheckResult.aiBrief ? (
                    <View style={styles.scAiBriefBox}>
                      <Text style={styles.scAiBriefLabel}>Report AI{selfCheckResult.aiMeta ? ` · ${selfCheckResult.aiMeta.provider}` : ""}</Text>
                      <Text style={styles.scAiBriefText}>{selfCheckResult.aiBrief}</Text>
                    </View>
                  ) : (
                    <Text style={styles.scNoAi}>Report AI non disponibile (provider non configurato).</Text>
                  )}
                  <Text style={styles.scStepsLabel}>Passi ({selfCheckResult.checks.length}):</Text>
                  {selfCheckResult.checks.map((s, idx) => (
                    <View key={idx} style={styles.scStepRow}>
                      <MaterialIcons
                        name={s.status === "ok" ? "check-circle" : s.status === "warn" ? "warning" : "error"}
                        size={16}
                        color={s.status === "ok" ? Colors.success : s.status === "warn" ? Colors.warning : Colors.error}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.scStepName}>{s.name} <Text style={styles.scStepDur}>({s.durationMs}ms)</Text></Text>
                        {s.message ? <Text style={styles.scStepMsg}>{s.message}</Text> : null}
                      </View>
                    </View>
                  ))}
                </>
              ) : (
                <Text style={styles.scNoAi}>Nessun risultato.</Text>
              )}
            </ScrollView>
            <View style={styles.scModalFooter}>
              <TouchableOpacity
                onPress={() => selfCheckMutation.mutate()}
                disabled={selfCheckMutation.isPending}
                style={[styles.scFooterBtn, { backgroundColor: Colors.accent }]}
              >
                <Text style={styles.scFooterBtnText}>{selfCheckMutation.isPending ? "Verifica..." : "Riesegui"}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowSelfCheckModal(false)}
                style={[styles.scFooterBtn, { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border }]}
              >
                <Text style={[styles.scFooterBtnText, { color: Colors.text }]}>Chiudi</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
        brokenIdSet={brokenIdSet}
        onReupload={handleReuploadImage}
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

