import React from "react";
import { StyleSheet, Alert } from "react-native";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme-context";
import { useT } from "@/lib/language-context";
import { useAuth } from "@/lib/auth-context";

import { ManualAdminSection } from "@/components/admin/settings/ManualAdminSection";
import { PdfDocumentAdminSection } from "@/components/admin/settings/PdfDocumentAdminSection";
import { EmailStatusCard } from "@/components/admin/settings/EmailStatusCard";
import { MatchingEngineSection } from "@/components/admin/settings/MatchingEngineSection";
import { CoordinateHistorySection } from "@/components/admin/settings/CoordinateHistorySection";
import { SosBikerSection } from "@/components/admin/settings/SosBikerSection";
import { MusicSystemSection } from "@/components/admin/settings/MusicSystemSection";
import { BackgroundLocationSection } from "@/components/admin/settings/BackgroundLocationSection";
import { AppSettingsSection } from "@/components/admin/settings/AppSettingsSection";
import { ThemeSection } from "@/components/admin/settings/ThemeSection";
import { GeneralToggleSection } from "@/components/admin/settings/GeneralToggleSection";
import { UptimeSection } from "@/components/admin/settings/UptimeSection";
import { OtaGateSection } from "@/components/admin/settings/OtaGateSection";
import { HomeMessageSection } from "@/components/admin/settings/HomeMessageSection";
import { SyncSection } from "@/components/admin/settings/SyncSection";
import { MapStyleSection } from "@/components/admin/settings/MapStyleSection";
import { useAdminSettingsState } from "@/components/admin/settings/useAdminSettingsState";
import Colors from "@/constants/colors";

export default function AdminSettings() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { currentTheme, setTheme, colors: themeColors } = useTheme();

  const state = useAdminSettingsState({ isAdmin, t, setTheme });

  return (
    <>
      <KeyboardAwareScrollViewCompat
        style={[styles.container, { backgroundColor: themeColors.background }]}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}
        bottomOffset={20}
      >
        <EmailStatusCard />

        <ThemeSection
          themeUserSwitching={state.themeUserSwitching}
          onThemeUserSwitchingToggle={(val) => state.themeSwitchingMutation.mutate(val)}
          themeUserSwitchingPending={state.themeSwitchingMutation.isPending}
          themeDefaultName={state.themeDefaultName}
          onThemeDefaultChange={(name) => state.themeDefaultMutation.mutate(name)}
          themeDefaultPending={state.themeDefaultMutation.isPending}
          currentTheme={currentTheme}
          setTheme={setTheme}
          colors={themeColors}
        />

        <GeneralToggleSection
          marketplaceEnabled={state.marketplaceEnabled}
          onMarketplaceToggle={(val) => state.setProtectedToggle({ key: "marketplace_enabled", value: val, label: "Mercatino Moto" })}
          marketplaceLoading={state.protectedToggleMutation.isPending}
          gpsRequired={state.gpsRequired}
          onGpsRequiredToggle={(val) => state.setProtectedToggle({ key: "gps_required", value: val, label: "GPS Obbligatorio" })}
          gpsRequiredLoading={state.protectedToggleMutation.isPending}
          ghostModeEnabled={state.ghostModeEnabled}
          onGhostModeToggle={(val) => state.setProtectedToggle({ key: "ghost_mode_enabled", value: val, label: "Ghost Mode" })}
          ghostModeLoading={state.protectedToggleMutation.isPending}
          emailVerifEnabled={state.emailVerifEnabled}
          onEmailVerifToggle={(val) => state.setProtectedToggle({ key: "email_verification_enabled", value: val, label: "Verifica Email" })}
          emailVerifLoading={state.protectedToggleMutation.isPending}
          phoneFieldEnabled={state.phoneFieldEnabled}
          onPhoneFieldToggle={(val) => state.setProtectedToggle({ key: "phone_field_enabled", value: val, label: "Campo telefono in registrazione" })}
          phoneFieldLoading={state.protectedToggleMutation.isPending}
          userAvailableOnLogin={state.userAvailableOnLogin}
          onUserAvailableToggle={(val) => state.setProtectedToggle({ key: "user_available_on_login", value: val, label: "Utente Disponibile all'accesso" })}
          userAvailableLoading={state.protectedToggleMutation.isPending}
          primalEnabled={state.primalEnabled}
          onPrimalToggle={(val) => state.setProtectedToggle({ key: "primal_user_enabled", value: val, label: "Account Primal" })}
          primalLoading={state.protectedToggleMutation.isPending}
          unitsPrefEnabled={state.unitsPrefEnabled}
          onUnitsPrefToggle={(val) => state.setProtectedToggle({ key: "units_preference_enabled", value: val, label: "Scelta Unità di Misura" })}
          unitsPrefLoading={state.protectedToggleMutation.isPending}
        />

        <MatchingEngineSection
          expanded={state.matchingEngineExpanded}
          onToggle={() => state.setMatchingEngineExpanded((v) => !v)}
          autoMatchEnabled={state.autoMatchEnabled}
          onAutoMatchToggle={(val) => state.autoMatchMutation.mutate(val)}
          autoMatchPending={state.autoMatchMutation.isPending}
          showSearchPrefEnabled={state.showSearchPrefEnabled}
          onShowSearchPrefToggle={(val) => state.showSearchPrefMutation.mutate(val)}
          showSearchPrefPending={state.showSearchPrefMutation.isPending}
          matchPrefVisibleEnabled={state.matchPrefVisibleEnabled}
          onMatchPrefVisibleToggle={(val) => state.matchPrefVisibleMutation.mutate(val)}
          matchPrefVisiblePending={state.matchPrefVisibleMutation.isPending}
          searchPrefLockedEnabled={state.searchPrefLockedEnabled}
          onSearchPrefLockedToggle={(val) => state.searchPrefLockedMutation.mutate(val)}
          searchPrefLockedPending={state.searchPrefLockedMutation.isPending}
          refetchIntervalInput={state.refetchIntervalInput}
          setRefetchIntervalInput={state.setRefetchIntervalInput}
          onRefetchIntervalEndEditing={() => {
            const val = parseInt(state.refetchIntervalInput, 10);
            if (!isNaN(val) && val >= 5) {
              state.refetchIntervalMutation.mutate(String(val));
            } else {
              state.setRefetchIntervalInput(String(state.refetchIntervalData?.seconds ?? 30));
            }
          }}
          coordMaxAgeInput={state.coordMaxAgeInput}
          setCoordMaxAgeInput={state.setCoordMaxAgeInput}
          onCoordMaxAgeEndEditing={() => {
            const val = parseInt(state.coordMaxAgeInput, 10);
            if (!isNaN(val) && val >= 10) {
              state.coordMaxAgeMutation.mutate(String(val));
            } else {
              state.setCoordMaxAgeInput(String(state.coordMaxAgeData?.value ?? 300));
            }
          }}
          motoclubCreationEnabled={state.motoclubCreationEnabled}
          onMotoclubCreationToggle={(val) => state.motoclubCreationMutation.mutate(val)}
          motoclubCreationPending={state.motoclubCreationMutation.isPending}
          matchingTriggerFeedback={state.matchingTriggerFeedback}
        />

        <CoordinateHistorySection
          expanded={state.coordHistoryExpanded}
          onToggle={() => state.setCoordHistoryExpanded((v) => !v)}
          settings={state.coordHistorySettings}
          stats={state.coordHistoryStats}
          chIntervalInput={state.chIntervalInput}
          setChIntervalInput={state.setChIntervalInput}
          onChIntervalEndEditing={() => {
            const val = parseInt(state.chIntervalInput, 10);
            if (!isNaN(val) && val >= 5) {
              state.coordHistoryMutation.mutate({ interval: val });
            } else {
              state.setChIntervalInput(String(state.coordHistorySettings?.interval ?? 30));
            }
          }}
          chMaxRecordsInput={state.chMaxRecordsInput}
          setChMaxRecordsInput={state.setChMaxRecordsInput}
          onChMaxRecordsEndEditing={() => {
            const val = parseInt(state.chMaxRecordsInput, 10);
            if (!isNaN(val) && val >= 10) {
              state.coordHistoryMutation.mutate({ maxRecords: val });
            } else {
              state.setChMaxRecordsInput(String(state.coordHistorySettings?.maxRecords ?? 1000));
            }
          }}
          chUserSearch={state.chUserSearch}
          setChUserSearch={state.setChUserSearch}
          chSearchResults={state.chSearchResults}
          onMutation={(body) => state.coordHistoryMutation.mutate(body)}
          isPending={state.coordHistoryMutation.isPending}
        />

        <BackgroundLocationSection
          expanded={state.bgLocationExpanded}
          onToggle={() => state.setBgLocationExpanded((v) => !v)}
          settings={state.bgLocationSettings}
          bgIntervalInput={state.bgIntervalInput}
          setBgIntervalInput={state.setBgIntervalInput}
          bgNotificationTextInput={state.bgNotificationTextInput}
          setBgNotificationTextInput={state.setBgNotificationTextInput}
          onMutation={(body) => state.bgLocationMutation.mutate(body)}
          isPending={state.bgLocationMutation.isPending}
        />

        <SosBikerSection
          enabled={state.sosEnabled}
          onToggle={(val) => state.sosMutation.mutate(val)}
          isPending={state.sosMutation.isPending}
        />

        <MusicSystemSection
          expanded={state.musicSystemExpanded}
          onToggle={() => state.setMusicSystemExpanded((v) => !v)}
          exportEnabled={state.musicExportEnabled}
          onExportToggle={(val: boolean) => state.musicExportMutation.mutate(val)}
          exportPending={state.musicExportMutation.isPending}
          importEnabled={state.musicImportEnabled}
          onImportToggle={(val: boolean) => state.musicImportMutation.mutate(val)}
          importPending={state.musicImportPending}
        />

        <MapStyleSection
          expanded={state.mapsExpanded}
          onToggle={() => state.setMapsExpanded((v) => !v)}
          mapsEnabled={state.mapsEnabled}
          onMapsEnabledToggle={(val: boolean) => state.mapsEnabledMutation.mutate(val)}
          mapsEnabledPending={state.mapsEnabledMutation.isPending}
          mapsProvider={state.mapsProvider}
          onMapsProviderChange={(val: "esri_gray" | "carto_light" | "carto_dark") => state.mapsProviderMutation.mutate(val)}
          mapsProviderPending={state.mapsProviderMutation.isPending}
        />

        <HomeMessageSection
          homeMessageEnabled={state.homeMessageEnabled}
          onHomeMessageToggle={(val) => state.homeMessageToggleMutation.mutate(val)}
          homeMessageTogglePending={state.homeMessageToggleMutation.isPending}
          homeMessageText={state.homeMessageText}
          setHomeMessageText={state.setHomeMessageText}
          onSaveHomeMessageText={state.handleSaveHomeMessageText}
          isSavingHomeMessage={state.isSavingHomeMessage}
        />

        <UptimeSection
          uptimeWidgetEnabled={state.uptimeWidgetEnabled}
          onUptimeToggle={state.handleUptimeToggle}
        />

        <OtaGateSection
          otaGateEnabled={state.otaGateEnabled}
          onOtaGateToggle={(val) => state.otaGateMutation.mutate(val)}
          otaGatePending={state.otaGateMutation.isPending}
          otaWaitInput={state.otaWaitInput}
          setOtaWaitInput={state.setOtaWaitInput}
          onOtaWaitSave={() => state.otaWaitMutation.mutate(state.otaWaitInput)}
          otaWaitPending={state.otaWaitPending}
          otaRetentionInput={state.otaRetentionInput}
          setOtaRetentionInput={state.setOtaRetentionInput}
          onOtaRetentionSave={() => state.otaRetentionMutation.mutate(state.otaRetentionInput)}
          otaRetentionPending={state.otaRetentionMutation.isPending}
          otaRetentionSuccess={state.otaRetentionMutation.isSuccess}
        />

        <SyncSection
          syncStatus={state.syncStatus}
          onSyncNow={() => {
            Alert.alert(
              "Sync produzione → sviluppo",
              t("admin.devDbOverwriteConfirm"),
              [
                { text: t("common.cancel"), style: "cancel" },
                { text: "Sincronizza", style: "destructive", onPress: () => state.syncMutation.mutate() },
              ]
            );
          }}
          syncPending={state.syncMutation.isPending}
        />

        <AppSettingsSection
          settings={state.defaultSettings}
          editingKey={state.editingKey}
          editValue={state.editValue}
          setEditValue={state.setEditValue}
          startEditing={state.startEditing}
          cancelEditing={() => state.setEditingKey(null)}
          handleSave={state.handleSave}
          isSaving={state.updateMutation.isPending}
          getSettingValue={state.getSettingValue}
          handleUploadEula={state.handleUploadEula}
          isUploadingEula={state.isUploadingEula}
        />
      </KeyboardAwareScrollViewCompat>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
});
