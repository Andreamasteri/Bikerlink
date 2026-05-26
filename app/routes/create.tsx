import React from "react";
import { View, StyleSheet, TouchableOpacity, ScrollView, Text, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import MapPickerContent from "@/components/MapPickerModal";
import { useRouteEditor } from "@/hooks/useRouteEditor";
import { useRoutePlanning } from "@/hooks/useRoutePlanning";

import { RouteOptionsPanel } from "@/components/routes/create/RouteOptionsPanel";
import { RouteMapPreview } from "@/components/routes/create/RouteMapPreview";
import { PlannerMapSection } from "@/components/routes/create/PlannerMapSection";
import { RouteWaypointsInput } from "@/components/routes/create/RouteWaypointsInput";
import { WaypointFormModal } from "@/components/routes/create/WaypointFormModal";
import { PublishRouteModal } from "@/components/routes/create/PublishRouteModal";
import { RouteAiSection } from "@/components/routes/create/RouteAiSection";

export default function CreateRouteScreen() {
  const insets = useSafeAreaInsets();

  const {
    t, WAYPOINT_TYPES, canSave,
    title, setTitle, description, setDescription,
    waypoints, mapOpen, setMapOpen, pendingCoord, setPendingCoord,
    waypointName, setWaypointName, waypointDesc, setWaypointDesc,
    waypointType, setWaypointType, showWaypointForm, setShowWaypointForm,
    showPublishDialog, isSettingVisibility, isImporting,
    saveMutation, handleImportGpx, handlePublishChoice,
    openMapForNewWaypoint, handleMapConfirm, handleWaypointFormSave,
    removeWaypoint, moveWaypoint, getWaypointMeta,
  } = useRouteEditor();

  const {
    webviewRef, curvatureMapHtml, routePolylinePts,
    isCalculatingRoute, routeStats, routeStyle, setRouteStyle, handleMapLoaded,
  } = useRoutePlanning(waypoints);

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        keyboardShouldPersistTaps="handled"
      >
        <RouteAiSection t={t} />

        <RouteOptionsPanel
          title={title}
          setTitle={setTitle}
          description={description}
          setDescription={setDescription}
        />

        <PlannerMapSection
          waypoints={waypoints.map((wp) => ({ lat: wp.latitude, lng: wp.longitude }))}
          trackPoints={routePolylinePts}
        />

        <RouteMapPreview
          waypoints={waypoints}
          curvatureMapHtml={curvatureMapHtml}
          webviewRef={webviewRef}
          handleMapLoaded={handleMapLoaded}
          routeStyle={routeStyle}
          setRouteStyle={setRouteStyle}
          isCalculatingRoute={isCalculatingRoute}
          routeStats={routeStats}
          trackPoints3D={routePolylinePts}
        />

        <RouteWaypointsInput
          waypoints={waypoints}
          t={t}
          handleImportGpx={handleImportGpx}
          isImporting={isImporting}
          openMapForNewWaypoint={openMapForNewWaypoint}
          getWaypointMeta={getWaypointMeta}
          moveWaypoint={moveWaypoint}
          removeWaypoint={removeWaypoint}
        />
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity
          style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
          onPress={() => saveMutation.mutate()}
          disabled={!canSave || saveMutation.isPending}
        >
          {saveMutation.isPending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="checkmark" size={22} color="#fff" />
              <Text style={styles.saveBtnText}>Salva Percorso</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {mapOpen && (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, elevation: 9999 }}>
          <MapPickerContent
            coord={pendingCoord}
            onCoordChange={setPendingCoord}
            onConfirm={handleMapConfirm}
            onClose={() => setMapOpen(false)}
            initialRegion={waypoints.length > 0 ? {
              latitude: waypoints[waypoints.length - 1].latitude,
              longitude: waypoints[waypoints.length - 1].longitude,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            } : undefined}
            existingWaypoints={waypoints.map((wp) => ({
              latitude: wp.latitude,
              longitude: wp.longitude,
              name: wp.name,
              waypointType: wp.waypointType,
            }))}
          />
        </View>
      )}

      <WaypointFormModal
        visible={showWaypointForm}
        waypointName={waypointName}
        setWaypointName={setWaypointName}
        waypointDesc={waypointDesc}
        setWaypointDesc={setWaypointDesc}
        waypointType={waypointType}
        setWaypointType={setWaypointType}
        waypointTypes={WAYPOINT_TYPES}
        pendingCoord={pendingCoord}
        onClose={() => { setShowWaypointForm(false); setPendingCoord(null); }}
        onSave={handleWaypointFormSave}
      />

      <PublishRouteModal
        visible={showPublishDialog}
        isSettingVisibility={isSettingVisibility}
        onChoice={handlePublishChoice}
        t={t}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  bottomBar: {
    position: "absolute" as const,
    bottom: 0, left: 0, right: 0,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  saveBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: Colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    gap: 8,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" as const },
});
