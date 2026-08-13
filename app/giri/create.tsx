import React, { useMemo, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { View, ScrollView, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { buildPlannerMapHtml } from "@/lib/leaflet-route-map-html";
import { useMapConfig } from "@/lib/map-context";
import { useMapsRollout } from "@/lib/maps/useMapsRollout";
import DebugPanel from "@/components/DebugPanel";
import { useLanguage } from "@/lib/language-context";

import { WaypointsSection } from "@/components/giri/create/WaypointsSection";
import { RouteOptionsSection } from "@/components/giri/create/RouteOptionsSection";
import { GarageIntegrationSection } from "@/components/giri/create/GarageIntegrationSection";
import { AiPreviewSection } from "@/components/giri/create/AiPreviewSection";
import { PoiStopSelector } from "@/components/giri/create/PoiStopSelector";
import { AiInputSection } from "@/components/giri/create/AiInputSection";
import { RouteStyleSection } from "@/components/giri/create/RouteStyleSection";
import { DrivingProfileSection } from "@/components/giri/create/DrivingProfileSection";
import { VehicleProfileSection } from "@/components/giri/create/VehicleProfileSection";
import { RouteMapSection } from "@/components/giri/create/RouteMapSection";
import { RouteTitleSection } from "@/components/giri/create/RouteTitleSection";
import { ActionButtonsSection } from "@/components/giri/create/ActionButtonsSection";
import { ModeSelector } from "@/components/giri/create/ModeSelector";
import { AiFallbackBanner } from "@/components/giri/create/AiFallbackBanner";
import { AiSuccessBanner } from "@/components/giri/create/AiSuccessBanner";
import { GiriCreateHeader } from "@/components/giri/create/GiriCreateHeader";
import { WeatherPreviewBanner } from "@/components/giri/create/WeatherPreviewBanner";
import { ImportGpxBanner } from "@/components/giri/create/ImportGpxBanner";
import { MultiDayPreview } from "@/components/giri/create/MultiDayPreview";
import { FuelPreview } from "@/components/giri/create/FuelPreview";
import { WeatherPreviewRow } from "@/components/giri/create/WeatherPreviewRow";
import { RouteResultSection } from "@/components/giri/create/RouteResultSection";
import { useRouteMapLogic } from "@/components/giri/create/useRouteMapLogic";
import { MapTapConfirmModal } from "@/components/giri/create/MapTapConfirmModal";
import { useGiriCreateStyles } from "@/components/giri/create/styles";

import { 
  STYLE_LEVELS, COMPASS_DIRECTIONS, RouteResult, 
  UserMotorcycle, MyStyleProfile 
} from "@/components/giri/create/types";
import { calcRoute } from "@/components/giri/create/api";
import { useGiriCreateState, SELECTED_MOTO_STORAGE_KEY } from "@/components/giri/create/useGiriCreateState";

export default function GiriCreateScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { language } = useLanguage();

  const {
    debugLogs, clearDebugLogs, debugVisible, handleTitleTap,
    isImportingGpx, handleImportGpx,
    mode, setMode, aiPrompt, setAiPrompt, aiLoading, handleAiParse,
    aiPreview, setAiPreview, aiFallbackBanner, setAiFallbackBanner, aiBannerReason,
    aiSuccessBanner, setAiSuccessBanner, aiSuccessTimer,
    title, setTitle, style, setStyle, drivingProfile, setDrivingProfile,
    vehicleProfile, setVehicleProfile,
    isRoundTrip, setIsRoundTrip, roundTripHours, setRoundTripHours,
    headingDeg, setHeadingDeg, isMultiDay, setIsMultiDay,
    daysCount, setDaysCount, maxHoursPerDay, setMaxHoursPerDay,
    avoidHighways, setAvoidHighways, avoidTolls, setAvoidTolls,
    avoidFerries, setAvoidFerries, avoidUnpaved, setAvoidUnpaved,
    avoidWeather, setAvoidWeather,
    visibility, setVisibility, selectedMotoId, setSelectedMotoId,
    fuelLevel, setFuelLevel, waypoints,
    wpInputs, wpSuggestions, wpLoading,
    routeResult, setRouteResult, calculating, setCalculating,
    routeError,
    dismissedWarnings, setDismissedWarnings,
    weatherPreview, weatherLoading,
    lastFittedWaypointSig, bikerScoreAnim,
    updatePreviewItemName, regeocodePillItem, selectPreviewItemSuggestion, handleConfirmPreview,
    handleWpInput, selectSuggestion, addWaypoint, removeWaypoint,
    handleCalculate, handleSave, saveMutationPending,
    handleMapTap,
    resolvedPoiStops, selectPoiOption, clearPoiOption,
    pendingMapTap, mapTapGeocoding, confirmMapTap, dismissMapTap,
  } = useGiriCreateState(language);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WebView ref type
  const webviewRef = React.useRef<any>(null);
  const autoCalcTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const { activeTileUrl, activeTileMaxZoom } = useMapConfig();
  const { renderer } = useMapsRollout();
  const isApproxRoute = !!routeResult && (!!routeResult.approximate || !routeResult.encoded);

  const compassDirLabel: string | null =
    mode === "ai"
      ? (aiPreview?.roundTripDirection ?? null)
      : (COMPASS_DIRECTIONS.find((d) => d.deg === headingDeg)?.label ?? null);

  const plannerMapHtml = useMemo(() => {
    return buildPlannerMapHtml(
      activeTileUrl,
      activeTileMaxZoom,
      colors.accent,
      waypoints,
      undefined,
      compassDirLabel
    );
  }, [waypoints, colors.accent, compassDirLabel, activeTileUrl, activeTileMaxZoom]);

  useEffect(() => {
    const js = `(function(){ if(typeof window.updateCompassDirection==='function'){ window.updateCompassDirection(${JSON.stringify(compassDirLabel)}); } })(); true;`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WebView ref injectJavaScript
    (webviewRef.current as any)?.injectJavaScript(js);
  }, [compassDirLabel]);

  const { data: motorcyclesData } = useQuery<UserMotorcycle[]>({
    queryKey: ["/api/motorcycles"]
  });
  const motorcycles = useMemo(() => motorcyclesData ?? [], [motorcyclesData]);

  // undefined = AsyncStorage not yet read; null = read, nothing saved; string = saved moto id
  const [storedMotoId, setStoredMotoId] = useState<string | null | undefined>(undefined);
  // Guard: hydrate selectedMotoId only once; subsequent motorcycles refetches must not overwrite in-session choice
  const motoHydratedRef = React.useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(SELECTED_MOTO_STORAGE_KEY)
      .then((id) => setStoredMotoId(id))
      .catch(() => setStoredMotoId(null));
  }, []);

  useEffect(() => {
    if (motoHydratedRef.current) return; // already initialized — protect in-session manual choices
    if (motorcycles.length === 0) return;
    if (storedMotoId === undefined) return; // wait for AsyncStorage to finish loading
    motoHydratedRef.current = true;
    setSelectedMotoId(() => {
      if (storedMotoId && motorcycles.some((m) => m.id === storedMotoId)) return storedMotoId;
      if (motorcycles.length === 1) return motorcycles[0].id;
      const defaultMoto = motorcycles.find((m) => m.isDefault);
      return defaultMoto ? defaultMoto.id : null;
    });
  }, [motorcycles, storedMotoId, setSelectedMotoId]);

  const { data: myStyleProfile } = useQuery<MyStyleProfile>({
    queryKey: ["/api/planned-routes/my-style-profile"],
    staleTime: 5 * 60 * 1000
  });

  // Gate per il profilo "auto panoramica": disponibile solo se il server Valhalla
  // self-hosted è raggiungibile. Se non lo è, l'opzione resta visibile ma bloccata.
  const { data: valhallaHealth } = useQuery<{ available: boolean }>({
    queryKey: ["/api/settings/valhalla-available"],
    staleTime: 60 * 1000
  });
  const autoCurvyAvailable = valhallaHealth?.available === true;

  useRouteMapLogic({
    routeResult,
    webviewRef,
    waypoints,
    lastFittedWaypointSig,
    bikerScoreAnim
  });

  useEffect(() => {
    if (mode !== "manual") return;
    const resolved = waypoints.filter((wp) => wp.lat !== 0 || wp.lng !== 0);
    if (resolved.length < 2) return;
    if (autoCalcTimeout.current) clearTimeout(autoCalcTimeout.current);
    autoCalcTimeout.current = setTimeout(async () => {
      const toCalc = isRoundTrip ? [...resolved, resolved[0]] : resolved;
      setCalculating(true);
      try {
        const ghRoutingProfile = vehicleProfile === "auto_curvy" ? "auto_curvy" : vehicleProfile === "moto_fast" ? "motorcycle_fast" : vehicleProfile === "car" ? "car" : undefined;
        const result = await calcRoute(toCalc, style, drivingProfile, avoidHighways, avoidTolls, avoidFerries, avoidUnpaved, avoidWeather, roundTripHours, isRoundTrip, headingDeg, language, ghRoutingProfile, true);
        setRouteResult(result);
        setDismissedWarnings(new Set());
      } catch {
        // silent
      } finally {
        setCalculating(false);
      }
    }, 500);
    return () => { if (autoCalcTimeout.current) clearTimeout(autoCalcTimeout.current); };
  }, [waypoints, style, drivingProfile, vehicleProfile, avoidHighways, avoidTolls, avoidFerries, avoidUnpaved, avoidWeather, isRoundTrip, roundTripHours, headingDeg, mode, language, setRouteResult, setCalculating, setDismissedWarnings]);

  const avgKmPerLiter = 18;
  const tankEstimateL = 15;
  const autonomyKm = Math.round(tankEstimateL * avgKmPerLiter * (fuelLevel / 100));
  const fuelStopsNeeded = routeResult ? Math.max(0, Math.ceil(routeResult.distanceKm / autonomyKm) - 1) : 0;

  const pillRoleLabel = (role: string) => {
    if (role === "start") return "Partenza";
    if (role === "end") return "Arrivo";
    return "Tappa";
  };
  const pillRoleColor = (role: string) => {
    if (role === "start") return "#22c55e";
    if (role === "end") return colors.accentRed;
    return colors.accent;
  };

  const styles = useGiriCreateStyles(colors);
  const topPad = insets.top;

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <GiriCreateHeader onBack={() => router.back()} onTitleTap={handleTitleTap} title="Pianifica Giro" />

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        <ModeSelector mode={mode} setMode={setMode} colors={colors} />

        <GarageIntegrationSection
          motorcycles={motorcycles} selectedMotoId={selectedMotoId}
          setSelectedMotoId={setSelectedMotoId} fuelLevel={fuelLevel}
          setFuelLevel={setFuelLevel} autonomyKm={autonomyKm}
          fuelStopsNeeded={fuelStopsNeeded}
        />

        {mode === "ai" && (
          <AiInputSection aiPrompt={aiPrompt} setAiPrompt={setAiPrompt} aiLoading={aiLoading} handleAiParse={handleAiParse} />
        )}

        {mode === "ai-preview" && aiPreview && (
          <>
            {aiSuccessBanner && <AiSuccessBanner onDismiss={() => setAiSuccessBanner(false)} />}
            <AiPreviewSection
              aiPreview={aiPreview} setAiPreview={setAiPreview} aiSuccessBanner={false}
              setAiSuccessBanner={setAiSuccessBanner} aiSuccessTimer={aiSuccessTimer}
              updatePreviewItemName={updatePreviewItemName} regeocodePillItem={regeocodePillItem}
              selectPreviewItemSuggestion={selectPreviewItemSuggestion}
              handleConfirmPreview={handleConfirmPreview} setMode={setMode}
              hasUnresolvedPois={resolvedPoiStops.some((s) => s.options.length > 0 && s.selectedOption === null)}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pill role helpers cast for prop compatibility
              pillRoleColor={pillRoleColor as any} pillRoleLabel={pillRoleLabel as any}
            />
            <View style={{ marginTop: 8 }}>
              {resolvedPoiStops.length > 0 ? (
                resolvedPoiStops.map((stop, idx) => (
                  <PoiStopSelector
                    key={`${stop.near}-${stop.query}-${idx}`}
                    stop={stop}
                    onSelectOption={(opt) => selectPoiOption(idx, opt)}
                    onClearSelection={() => clearPoiOption(idx)}
                  />
                ))
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 12, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border }}>
                  <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: colors.textSecondary, flex: 1 }}>
                    {aiPreview.poiStops && aiPreview.poiStops.length > 0
                      ? "L'AI ha suggerito delle tappe ma non è stato possibile localizzarle sulla mappa"
                      : "Nessun suggerimento AI generato per questo percorso"}
                  </Text>
                </View>
              )}
            </View>
          </>
        )}

        {mode === "manual" && (
          <>
            <ImportGpxBanner isImporting={isImportingGpx} colors={colors} />
            {aiFallbackBanner && <AiFallbackBanner onDismiss={() => setAiFallbackBanner(false)} reason={aiBannerReason} />}
            <RouteTitleSection title={title} setTitle={setTitle} />
            <RouteStyleSection style={style} setStyle={setStyle} STYLE_LEVELS={STYLE_LEVELS} />
            <VehicleProfileSection vehicleProfile={vehicleProfile} setVehicleProfile={setVehicleProfile} autoCurvyAvailable={autoCurvyAvailable} />
            {vehicleProfile !== "auto_curvy" && vehicleProfile !== "car" && (
              <DrivingProfileSection drivingProfile={drivingProfile} setDrivingProfile={setDrivingProfile} myStyleProfile={myStyleProfile} />
            )}
            <WaypointsSection
              waypoints={waypoints} wpInputs={wpInputs} wpSuggestions={wpSuggestions}
              wpLoading={wpLoading} isImportingGpx={isImportingGpx} onWpInputChange={handleWpInput}
              onSelectSuggestion={selectSuggestion} onRemoveWaypoint={removeWaypoint}
              onAddWaypoint={addWaypoint} onImportGpx={handleImportGpx}
            />
            <RouteMapSection plannerMapHtml={plannerMapHtml} webviewRef={webviewRef} onMapTap={handleMapTap} isApproxRoute={isApproxRoute} calculating={calculating} renderer={renderer} waypoints3D={waypoints.map((w: { lat: number; lng: number }) => ({ lat: w.lat, lng: w.lng }))} />
          </>
        )}

        <RouteOptionsSection
          isRoundTrip={isRoundTrip} setIsRoundTrip={setIsRoundTrip}
          roundTripHours={roundTripHours} setRoundTripHours={setRoundTripHours}
          headingDeg={headingDeg} setHeadingDeg={setHeadingDeg}
          isMultiDay={isMultiDay} setIsMultiDay={setIsMultiDay}
          daysCount={daysCount} setDaysCount={setDaysCount}
          maxHoursPerDay={maxHoursPerDay} setMaxHoursPerDay={setMaxHoursPerDay}
          avoidHighways={avoidHighways} setAvoidHighways={setAvoidHighways}
          avoidTolls={avoidTolls} setAvoidTolls={setAvoidTolls}
          avoidFerries={avoidFerries} setAvoidFerries={setAvoidFerries}
          avoidUnpaved={avoidUnpaved} setAvoidUnpaved={setAvoidUnpaved}
          avoidWeather={avoidWeather} setAvoidWeather={setAvoidWeather}
          visibility={visibility} setVisibility={setVisibility}
          COMPASS_DIRECTIONS={COMPASS_DIRECTIONS}
        />

        <MultiDayPreview isMultiDay={isMultiDay} daysCount={daysCount} routeResult={routeResult ?? { distanceKm: 0, durationMinutes: 0 } as RouteResult} />
        <FuelPreview selectedMotoId={selectedMotoId} fuelStopsNeeded={fuelStopsNeeded} />
        <WeatherPreviewBanner weatherLoading={weatherLoading} weatherPreview={weatherPreview} />
        {weatherPreview && weatherPreview.length > 0 && <WeatherPreviewRow weather={weatherPreview} colors={colors} />}

        {(() => {
          const unresolvedCount = waypoints.filter((wp, i) => (wpInputs[i] ?? "").trim().length > 0 && wp.lat === 0).length;
          if (unresolvedCount === 0) return null;
          return (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: "#f59e0b18", borderWidth: 1, borderColor: "#f59e0b55" }}>
              <Ionicons name="warning-outline" size={15} color="#f59e0b" />
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: "#f59e0b", flex: 1 }}>
                {unresolvedCount === 1
                  ? "1 luogo da confermare — tocca 📍 per selezionare"
                  : `${unresolvedCount} luoghi da confermare — tocca 📍 per selezionare`}
              </Text>
            </View>
          );
        })()}

        <ActionButtonsSection calculating={calculating} handleCalculate={handleCalculate} routeResult={routeResult} handleSave={handleSave} saveMutationPending={saveMutationPending} routeError={routeError} />

        <RouteResultSection
          routeResult={routeResult} isRoundTrip={isRoundTrip} isMultiDay={isMultiDay}
          daysCount={daysCount} dismissedWarnings={dismissedWarnings}
          setDismissedWarnings={setDismissedWarnings} weatherLoading={weatherLoading}
          weatherPreview={weatherPreview} selectedMotoId={selectedMotoId}
          fuelStopsNeeded={fuelStopsNeeded} bikerScoreAnim={bikerScoreAnim}
        />
      </ScrollView>

      {debugVisible && <DebugPanel logs={debugLogs} onClear={clearDebugLogs} />}

      <MapTapConfirmModal
        visible={!!pendingMapTap}
        address={pendingMapTap?.name ?? ""}
        geocoding={mapTapGeocoding}
        onSetStart={() => confirmMapTap("start")}
        onAddWaypoint={() => confirmMapTap("waypoint")}
        onSetEnd={() => confirmMapTap("end")}
        onDismiss={dismissMapTap}
      />
    </View>
  );
}
