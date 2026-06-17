import React from "react";
import { StyleSheet, Alert, View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme-context";
import { useT } from "@/lib/language-context";
import { useAuth } from "@/lib/auth-context";
import Colors from "@/constants/colors";

import { EmailStatusCard } from "@/components/admin/settings/EmailStatusCard";
import { CoordinateHistorySection } from "@/components/admin/settings/CoordinateHistorySection";
import { SosBikerSection } from "@/components/admin/settings/SosBikerSection";
import { MusicSystemSection } from "@/components/admin/settings/MusicSystemSection";
import { BackgroundLocationSection } from "@/components/admin/settings/BackgroundLocationSection";
import { AppSettingsSection } from "@/components/admin/settings/AppSettingsSection";
import { ApkSection } from "@/components/admin/settings/ApkSection";
import { ThemeSection } from "@/components/admin/settings/ThemeSection";
import { AppFeaturesSection } from "@/components/admin/settings/AppFeaturesSection";
import { RegistrationSection } from "@/components/admin/settings/RegistrationSection";
import { UptimeSection } from "@/components/admin/settings/UptimeSection";
import { HomeMessageSection } from "@/components/admin/settings/HomeMessageSection";
import { SplashMessagesSection } from "@/components/admin/settings/SplashMessagesSection";
import { SyncSection } from "@/components/admin/settings/SyncSection";
import { MapStyleSection } from "@/components/admin/settings/MapStyleSection";
import { AisSection } from "@/components/admin/settings/AisSection";
import { GpsNoiseFilterSection } from "@/components/admin/settings/GpsNoiseFilterSection";
import { SupportSection } from "@/components/admin/settings/SupportSection";
import { useAdminSettingsState } from "@/components/admin/settings/useAdminSettingsState";

type IoniconsName = React.ComponentProps<typeof Ionicons>["name"];

function SectionHeader({ icon, label }: { icon: IoniconsName; label: string }) {
  return (
    <View style={styles.sectionHeaderRow}>
      <Ionicons name={icon} size={20} color={Colors.textSecondary} />
      <Text style={styles.sectionTitle}>{label}</Text>
    </View>
  );
}

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
        {/* ── 1. COMUNICAZIONE ── */}
        <SectionHeader icon="megaphone-outline" label="Comunicazione" />
        <HomeMessageSection
          homeMessageEnabled={state.homeMessageEnabled}
          onHomeMessageToggle={(val) => state.homeMessageToggleMutation.mutate(val)}
          homeMessageTogglePending={state.homeMessageToggleMutation.isPending}
          homeMessageText={state.homeMessageText}
          setHomeMessageText={state.setHomeMessageText}
          onSaveHomeMessageText={state.handleSaveHomeMessageText}
          isSavingHomeMessage={state.isSavingHomeMessage}
        />
        <SplashMessagesSection
          splashMode={state.splashMode}
          handleSaveSplashMode={state.handleSaveSplashMode}
          splashMessagesList={state.splashMessagesList}
          handleSaveSplashList={state.handleSaveSplashList}
        />

        {/* ── 2. SUPPORTO TECNICO ── */}
        <SectionHeader icon="headset-outline" label="Supporto tecnico" />
        <SupportSection />

        {/* ── 3. ACCESSO & REGISTRAZIONE ── */}
        <SectionHeader icon="person-circle-outline" label="Accesso & Registrazione" />
        <EmailStatusCard />
        <RegistrationSection
          emailVerifEnabled={state.emailVerifEnabled}
          onEmailVerifToggle={(val) => state.protectedToggleMutation.mutate({ key: "email_verification_enabled", value: val ? "true" : "false" })}
          emailVerifLoading={state.protectedToggleMutation.isPending}
          phoneFieldEnabled={state.phoneFieldEnabled}
          onPhoneFieldToggle={(val) => state.protectedToggleMutation.mutate({ key: "phone_field_enabled", value: val ? "true" : "false" })}
          phoneFieldLoading={state.protectedToggleMutation.isPending}
          userAvailableOnLogin={state.userAvailableOnLogin}
          onUserAvailableToggle={(val) => state.protectedToggleMutation.mutate({ key: "user_available_on_login", value: val ? "true" : "false" })}
          userAvailableLoading={state.protectedToggleMutation.isPending}
          primalEnabled={state.primalEnabled}
          onPrimalToggle={(val) => state.protectedToggleMutation.mutate({ key: "primal_user_enabled", value: val ? "true" : "false" })}
          primalLoading={state.protectedToggleMutation.isPending}
        />

        {/* ── 3. FUNZIONALITÀ APP ── */}
        <SectionHeader icon="apps-outline" label="Funzionalità App" />
        <AppFeaturesSection
          marketplaceEnabled={state.marketplaceEnabled}
          onMarketplaceToggle={(val) => state.protectedToggleMutation.mutate({ key: "marketplace_enabled", value: val ? "true" : "false" })}
          marketplaceLoading={state.protectedToggleMutation.isPending}
          gpsRequired={state.gpsRequired}
          onGpsRequiredToggle={(val) => state.protectedToggleMutation.mutate({ key: "gps_required", value: val ? "true" : "false" })}
          gpsRequiredLoading={state.protectedToggleMutation.isPending}
          ghostModeEnabled={state.ghostModeEnabled}
          onGhostModeToggle={(val) => state.protectedToggleMutation.mutate({ key: "ghost_mode_enabled", value: val ? "true" : "false" })}
          ghostModeLoading={state.protectedToggleMutation.isPending}
          unitsPrefEnabled={state.unitsPrefEnabled}
          onUnitsPrefToggle={(val) => state.protectedToggleMutation.mutate({ key: "units_preference_enabled", value: val ? "true" : "false" })}
          unitsPrefLoading={state.protectedToggleMutation.isPending}
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

        {/* ── 4. GPS & MAPPE ── */}
        <SectionHeader icon="navigate-circle-outline" label="GPS & Mappe" />
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
        <GpsNoiseFilterSection />
        <AisSection />

        {/* ── 5. INTERFACCIA ── */}
        <SectionHeader icon="color-palette-outline" label="Interfaccia" />
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

        {/* ── 6. DOCUMENTI ── */}
        <SectionHeader icon="document-text-outline" label="Documenti" />
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
        <ApkSection />

        {/* ── 7. STRUMENTI SVILUPPO ── */}
        <SectionHeader icon="construct-outline" label="Strumenti Sviluppo" />
        <UptimeSection
          uptimeWidgetEnabled={state.uptimeWidgetEnabled}
          onUptimeToggle={state.handleUptimeToggle}
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
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 24,
    marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
