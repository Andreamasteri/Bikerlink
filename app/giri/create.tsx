import React, { useMemo, useEffect } from "react";
import { View, ScrollView } from "react-native";
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
import { AiInputSection } from "@/components/giri/create/AiInputSection";
import { RouteStyleSection } from "@/components/giri/create/RouteStyleSection";
import { DrivingProfileSection } from "@/components/giri/create/DrivingProfileSection";
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
import { useGiriCreateStyles } from "@/components/giri/create/styles";

import { 
  STYLE_LEVELS, COMPASS_DIRECTIONS, RouteResult, 
  UserMotorcycle, MyStyleProfile 
} from "@/components/giri/create/types";
import { calcRoute } from "@/components/giri/create/api";
import { useGiriCreateState } from "@/components/giri/create/useGiriCreateState";

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
    isRoundTrip, setIsRoundTrip, roundTripHours, setRoundTripHours,
    headingDeg, setHeadingDeg, isMultiDay, setIsMultiDay,
    daysCount, setDaysCount, maxHoursPerDay, setMaxHoursPerDay,
    avoidHighways, setAvoidHighways, avoidTolls, setAvoidTolls,
    avoidFerries, setAvoidFerries, avoidUnpaved, setAvoidUnpaved,
    visibility, setVisibility, selectedMotoId, setSelectedMotoId,
    fuelLevel, setFuelLevel, waypoints,
    wpInputs, wpSuggestions,
    routeResult, setRouteResult, calculating, setCalculating,
    dismissedWarnings, setDismissedWarnings,
    weatherPreview, weatherLoading,
    lastFittedWaypointSig, bikerScoreAnim,
    updatePreviewItemName, regeocodePillItem, handleConfirmPreview,
    handleWpInput, selectSuggestion, addWaypoint, removeWaypoint,
    handleCalculate, handleSave, saveMutationPending,
    handleMapTap
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

  const { data: motorcycles = [] } = useQuery<UserMotorcycle[]>({
    queryKey: ["/api/motorcycles"]
  });

  const { data: myStyleProfile } = useQuery<MyStyleProfile>({
    queryKey: ["/api/planned-routes/my-style-profile"],
    staleTime: 5 * 60 * 1000
  });

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
        const result = await calcRoute(toCalc, style, drivingProfile, avoidHighways, avoidTolls, avoidFerries, avoidUnpaved, roundTripHours, isRoundTrip, headingDeg, language);
        setRouteResult(result);
        setDismissedWarnings(new Set());
      } catch {
        // silent
      } finally {
        setCalculating(false);
      }
    }, 500);
    return () => { if (autoCalcTimeout.current) clearTimeout(autoCalcTimeout.current); };
  }, [waypoints, style, drivingProfile, avoidHighways, avoidTolls, avoidFerries, avoidUnpaved, isRoundTrip, roundTripHours, headingDeg, mode, language, setRouteResult, setCalculating, setDismissedWarnings]);

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
              handleConfirmPreview={handleConfirmPreview} setMode={setMode}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pill role helpers cast for prop compatibility
              pillRoleColor={pillRoleColor as any} pillRoleLabel={pillRoleLabel as any}
            />
          </>
        )}

        {mode === "manual" && (
          <>
            <ImportGpxBanner isImporting={isImportingGpx} colors={colors} />
            {aiFallbackBanner && <AiFallbackBanner onDismiss={() => setAiFallbackBanner(false)} reason={aiBannerReason} />}
            <RouteTitleSection title={title} setTitle={setTitle} />
            <RouteStyleSection style={style} setStyle={setStyle} STYLE_LEVELS={STYLE_LEVELS} />
            <DrivingProfileSection drivingProfile={drivingProfile} setDrivingProfile={setDrivingProfile} myStyleProfile={myStyleProfile} />
            <RouteMapSection plannerMapHtml={plannerMapHtml} webviewRef={webviewRef} onMapTap={handleMapTap} isApproxRoute={isApproxRoute} calculating={calculating} renderer={renderer} waypoints3D={waypoints.map((w: { lat: number; lng: number }) => ({ lat: w.lat, lng: w.lng }))} />
          </>
        )}

        <WaypointsSection
          waypoints={waypoints} wpInputs={wpInputs} wpSuggestions={wpSuggestions}
          isImportingGpx={isImportingGpx} onWpInputChange={handleWpInput}
          onSelectSuggestion={selectSuggestion} onRemoveWaypoint={removeWaypoint}
          onAddWaypoint={addWaypoint} onImportGpx={handleImportGpx}
        />

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
          visibility={visibility} setVisibility={setVisibility}
          COMPASS_DIRECTIONS={COMPASS_DIRECTIONS}
        />

        <GarageIntegrationSection
          motorcycles={motorcycles} selectedMotoId={selectedMotoId}
          setSelectedMotoId={setSelectedMotoId} fuelLevel={fuelLevel}
          setFuelLevel={setFuelLevel} autonomyKm={autonomyKm}
          fuelStopsNeeded={fuelStopsNeeded}
        />

        <MultiDayPreview isMultiDay={isMultiDay} daysCount={daysCount} routeResult={routeResult ?? { distanceKm: 0, durationMinutes: 0 } as RouteResult} />
        <FuelPreview selectedMotoId={selectedMotoId} fuelStopsNeeded={fuelStopsNeeded} />
        <WeatherPreviewBanner weatherLoading={weatherLoading} weatherPreview={weatherPreview} />
        {weatherPreview && weatherPreview.length > 0 && <WeatherPreviewRow weather={weatherPreview} colors={colors} />}

        <ActionButtonsSection calculating={calculating} handleCalculate={handleCalculate} routeResult={routeResult} handleSave={handleSave} saveMutationPending={saveMutationPending} />

        <RouteResultSection
          routeResult={routeResult} isRoundTrip={isRoundTrip} isMultiDay={isMultiDay}
          daysCount={daysCount} dismissedWarnings={dismissedWarnings}
          setDismissedWarnings={setDismissedWarnings} weatherLoading={weatherLoading}
          weatherPreview={weatherPreview} selectedMotoId={selectedMotoId}
          fuelStopsNeeded={fuelStopsNeeded} bikerScoreAnim={bikerScoreAnim}
        />
      </ScrollView>

      {debugVisible && <DebugPanel logs={debugLogs} onClear={clearDebugLogs} />}
    </View>
  );
}
