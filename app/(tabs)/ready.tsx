import React from "react";
import { View, StyleSheet, ScrollView, ActivityIndicator, Alert } from "react-native";
import Colors from "@/constants/colors";
import { InlineMiniPlayer } from "@/components/MiniPlayer";
import { useColors } from "@/hooks/useColors";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSetting } from "@/lib/settings-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/query-client";
import { Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { VisibilitySummary } from "@/components/ready/VisibilitySummary";
import { ReadyInfoModal } from "@/components/ready/ReadyInfoModal";
import { SosModal } from "@/components/ready/SosModal";
import { PrivacyPositionSettings } from "@/components/ready/PrivacyPositionSettings";
import { GpsPrecisionSettings } from "@/components/ready/GpsPrecisionSettings";
import { ReadyStatusHeader } from "@/components/ready/ReadyStatusHeader";
import { MapPickerModal } from "@/components/ready/MapPickerModal";
import { PrivacySettingsGroup } from "@/components/ready/PrivacySettingsGroup";
import { SosButton } from "@/components/ready/SosButton";
import { useReadyState } from "@/hooks/useReadyState";

export default function ReadyToRideScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const sosEnabled = useSetting("sosEnabled");

  const {
    t,
    user,
    infoModalVisible, setInfoModalVisible,
    showSosModal, setShowSosModal,
    sosReason, setSosReason,
    sosRadiusKm, setSosRadiusKm,
    customRadius, setCustomRadius,
    location,
    toastMsg,
    privacyExpanded, setPrivacyExpanded,
    gpsPrecisionExpanded, setGpsPrecisionExpanded,
    positionFuzz, setPositionFuzz,
    positionFuzzKm, setPositionFuzzKm,
    fakeHomeEnabled, setFakeHomeEnabled,
    homeLatitude, homeLongitude,
    fakeHomeLatitude, fakeHomeLongitude,
    fakeHomeRadius, setFakeHomeRadius,
    fakeWorkEnabled, setFakeWorkEnabled,
    workLatitude, workLongitude,
    fakeWorkLatitude, fakeWorkLongitude,
    fakeWorkRadius, setFakeWorkRadius,
    fakeWhateverEnabled, setFakeWhateverEnabled,
    whateverLatitude, whateverLongitude,
    fakeWhateverLatitude, fakeWhateverLongitude,
    fakeWhateverRadius, setFakeWhateverRadius,
    gpsPrecision, setGpsPrecision,
    mapPickerVisible, setMapPickerVisible,
    mapPickerCoord, setMapPickerCoord,
    ghostModeFeatureEnabled,
    isAvailable,
    isGhostMode,
    hideFromMap,
    offlineRandomize,
    isLoading,
    toggleMutation,
    ghostMutation,
    privacyMutation,
    handleToggle,
    openMapPicker,
    confirmMapPicker,
    pickFromGPS,
    fixedPositionEnabled,
    fixedPositionLat,
    fixedPositionLng,
    isSettingFixedPosition,
    setFixedPositionFromGPS,
    openFixedPositionMapPicker,
  } = useReadyState();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SOS response shape from API
  const mySosQuery = useQuery<any>({
    queryKey: ["/api/sos/my"],
    staleTime: 10000,
    refetchInterval: 10000,
    enabled: !!user && sosEnabled,
  });

  const createSosMutation = useMutation({
    mutationFn: async (d: { reason: string; latitude: number; longitude: number; radiusKm: number }) => {
      const res = await apiRequest("POST", "/api/sos", d);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sos/my"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sos/active"] });
      setShowSosModal(false);
      setSosReason("");
      setSosRadiusKm(10);
      setCustomRadius("");
    },
    onError: (error: Error) => {
      Alert.alert("Errore", (error as Error).message);
    },
  });

  const cancelSosMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PUT", `/api/sos/${id}/cancel`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sos/my"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sos/active"] });
    },
    onError: (error: Error) => {
      Alert.alert("Errore", (error as Error).message);
    },
  });

  const gpsOptions = [
    { key: "lowest", label: t("profile.gpsLowestLabel"), desc: t("profile.gpsLowestDesc"), icon: "battery-half-outline" },
    { key: "balanced", label: t("profile.gpsBalancedLabel"), desc: t("profile.gpsBalancedDesc"), icon: "compass-outline" },
    { key: "high", label: t("profile.gpsHighLabel"), desc: t("profile.gpsHighDesc"), icon: "locate-outline" },
    { key: "highest", label: t("profile.gpsHighestLabel"), desc: t("profile.gpsHighestDesc"), icon: "navigate-outline" },
    { key: "bestForNavigation", label: t("profile.gpsBestForNavLabel"), desc: t("profile.gpsBestForNavDesc"), icon: "map-outline" },
  ] as { key: string; label: string; desc: string; icon: string }[];

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <InlineMiniPlayer />

      <Pressable
        style={{ position: "absolute", top: insets.top + 8, right: 16, zIndex: 10, padding: 6 }}
        onPress={() => setInfoModalVisible(true)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="information-circle-outline" size={26} color={colors.textSecondary} />
      </Pressable>

      <ReadyInfoModal
        visible={infoModalVisible}
        onClose={() => setInfoModalVisible(false)}
        insets={insets}
      />

      <MapPickerModal
        visible={mapPickerVisible}
        onClose={() => setMapPickerVisible(false)}
        onConfirm={confirmMapPicker}
        coord={mapPickerCoord}
        setCoord={setMapPickerCoord}
        insets={insets}
      />

      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom: insets.bottom + 16,
          },
        ]}
      >
        <ReadyStatusHeader
          isAvailable={isAvailable}
          t={t}
          handleToggle={handleToggle}
          isPending={toggleMutation.isPending || ghostMutation.isPending}
          toastMsg={toastMsg}
        />

        <View style={styles.viewContent}>
          <VisibilitySummary
            isAvailable={isAvailable}
            isGhostMode={isGhostMode}
            hideFromMap={hideFromMap}
            offlineRandomize={offlineRandomize}
          />

          <PrivacySettingsGroup
            t={t}
            colors={colors}
            isGhostMode={isGhostMode}
            ghostModeFeatureEnabled={ghostModeFeatureEnabled}
            ghostMutation={ghostMutation}
            hideFromMap={hideFromMap}
            offlineRandomize={offlineRandomize}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- privacyMutation shape from useReadyState
            privacyMutation={privacyMutation as any}
            fixedPositionEnabled={fixedPositionEnabled}
            fixedPositionLat={fixedPositionLat}
            fixedPositionLng={fixedPositionLng}
            onSetFixedPositionFromGPS={setFixedPositionFromGPS}
            onChooseFixedPositionOnMap={openFixedPositionMapPicker}
            isSettingFixedPosition={isSettingFixedPosition}
          />

          <PrivacyPositionSettings
            t={t}
            colors={colors}
            privacyExpanded={privacyExpanded}
            setPrivacyExpanded={setPrivacyExpanded}
            positionFuzz={positionFuzz}
            setPositionFuzz={setPositionFuzz}
            positionFuzzKm={positionFuzzKm}
            setPositionFuzzKm={setPositionFuzzKm}
            fakeHomeEnabled={fakeHomeEnabled}
            setFakeHomeEnabled={setFakeHomeEnabled}
            homeLatitude={homeLatitude}
            homeLongitude={homeLongitude}
            fakeHomeLatitude={fakeHomeLatitude}
            fakeHomeLongitude={fakeHomeLongitude}
            fakeHomeRadius={fakeHomeRadius}
            setFakeHomeRadius={setFakeHomeRadius}
            fakeWorkEnabled={fakeWorkEnabled}
            setFakeWorkEnabled={setFakeWorkEnabled}
            workLatitude={workLatitude}
            workLongitude={workLongitude}
            fakeWorkLatitude={fakeWorkLatitude}
            fakeWorkLongitude={fakeWorkLongitude}
            fakeWorkRadius={fakeWorkRadius}
            setFakeWorkRadius={setFakeWorkRadius}
            fakeWhateverEnabled={fakeWhateverEnabled}
            setFakeWhateverEnabled={setFakeWhateverEnabled}
            whateverLatitude={whateverLatitude}
            whateverLongitude={whateverLongitude}
            fakeWhateverLatitude={fakeWhateverLatitude}
            fakeWhateverLongitude={fakeWhateverLongitude}
            fakeWhateverRadius={fakeWhateverRadius}
            setFakeWhateverRadius={setFakeWhateverRadius}
            privacyMutation={privacyMutation}
            pickFromGPS={pickFromGPS}
            openMapPicker={openMapPicker}
          />
          <GpsPrecisionSettings
            colors={colors}
            gpsPrecisionExpanded={gpsPrecisionExpanded}
            setGpsPrecisionExpanded={setGpsPrecisionExpanded}
            gpsOptions={gpsOptions}
            gpsPrecision={gpsPrecision}
            setGpsPrecision={setGpsPrecision}
            privacyMutation={privacyMutation}
          />
        </View>

        {sosEnabled && (
          <SosButton
            mySosData={mySosQuery.data}
            setShowSosModal={setShowSosModal}
            cancelSosMutation={cancelSosMutation}
          />
        )}

        <SosModal
          visible={showSosModal}
          onClose={() => setShowSosModal(false)}
          sosReason={sosReason}
          setSosReason={setSosReason}
          sosRadiusKm={sosRadiusKm}
          setSosRadiusKm={setSosRadiusKm}
          customRadius={customRadius}
          setCustomRadius={setCustomRadius}
          onSubmit={(finalRadius) => {
            const sendSos = (coords: { latitude: number; longitude: number }) => {
              createSosMutation.mutate({
                reason: sosReason.trim(),
                latitude: coords.latitude,
                longitude: coords.longitude,
                radiusKm: finalRadius,
              });
            };
            if (location) {
              sendSos(location);
            } else {
              Alert.alert(
                t("tracking.gpsUnavailable"),
                t("ready.approxLocationMsg"),
                [
                  { text: t("common.cancel"), style: "cancel" },
                  { text: t("ready.sendAnyway"), onPress: () => sendSos({ latitude: 42.5, longitude: 12.5 }) },
                ]
              );
            }
          }}
          isPending={createSosMutation.isPending}
          location={location}
          t={t}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    flexGrow: 1,
  },
  viewContent: {
    padding: 24,
    gap: 8,
    alignItems: "center",
  },
});
