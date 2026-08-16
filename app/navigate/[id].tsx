import React, { useState } from "react";
import { View, ActivityIndicator, Alert } from "react-native";
import { NavigationMap } from "@/components/navigate/NavigationMap";
import { NavigationInstruction } from "@/components/navigate/NavigationInstruction";
import { NavigationWeather } from "@/components/navigate/NavigationWeather";
import { NavigationFinished } from "@/components/navigate/NavigationFinished";
import { NavigationOfflineBanners } from "@/components/navigate/NavigationOfflineBanners";
import { signToIcon, formatDistance, formatDuration } from "@/components/navigate/navigate-helpers";
import { makeStyles } from "@/components/navigate/[id].styles";
import { useNavigateState } from "@/hooks/navigate/useNavigateState";
import { useRouter, type Href } from "expo-router";
import { apiRequest } from "@/lib/query-client";

export default function NavigateScreen() {
  const router = useRouter();
  const {
    colors, topPad, bottomPad, webViewRef,
    route, isLoading, isFinished,
    currentStep, distanceToNext, progressPct, remainingKm, remainingMin,
    isRerouting, isOffline, weatherLoading, currentWeather, aheadWeather,
    mapUri, offline, activeStepsRef,
    navigationTrackRef, navigationDistanceKmRef, navigationStartedAtRef, navigationFinishedAtRef, navigationMaxSpeedRef,
    minimalMode, handleToggleMinimal,
    handleMapMessage, handleClose, triggerWeatherReroute,
  } = useNavigateState();

  const s = makeStyles(colors);
  const [saving, setSaving] = useState(false);

  const saveNavigationTrack = async () => {
    if (saving || !route) return;
    setSaving(true);
    let createdRouteId: string | null = null;
    let completed = false;
    try {
      const points = navigationTrackRef.current;
      const distanceKm = navigationDistanceKmRef.current;
      const startedAt = navigationStartedAtRef.current ?? Date.now();
      const finishedAt = navigationFinishedAtRef.current ?? Date.now();
      const durationSeconds = Math.max(0, Math.round((finishedAt - startedAt) / 1000));
      const avgSpeedKmh = durationSeconds > 0 ? distanceKm / (durationSeconds / 3600) : 0;
      const created = await (await apiRequest("POST", "/api/routes", {
        title: `Navigazione: ${route.title}`,
        status: "active",
      })).json() as { id?: string };
      if (!created.id) throw new Error("Route non creata");
      createdRouteId = created.id;
      if (points.length > 0) {
        await apiRequest("POST", `/api/routes/${created.id}/points`, { points });
      }
      await apiRequest("PUT", `/api/routes/${created.id}/stop`, {
        totalDistanceKm: distanceKm,
        maxSpeedKmh: navigationMaxSpeedRef.current,
        avgSpeedKmh,
        durationSeconds,
      });
      completed = true;
      router.replace("/(tabs)/tracking" as Href);
    } catch (error) {
      console.warn("[navigation] save track failed", error);
      if (createdRouteId && !completed) {
        // Do not blindly delete: the request may have succeeded server-side
        // while the response was lost. Inspect first; preserve a completed
        // route, and only remove an unfinished placeholder that this flow
        // created. If the inspection itself fails, leave the row for the
        // server orphan cleanup rather than risking deletion of real data.
        try {
          const statusResponse = await apiRequest("GET", `/api/routes/${createdRouteId}`);
          const current = await statusResponse.json() as { status?: string };
          if (current.status !== "completed") {
            await apiRequest("DELETE", `/api/routes/${createdRouteId}`);
          }
        } catch (cleanupError) {
          console.warn("[navigation] unfinished route preserved for cleanup", cleanupError);
        }
      }
      Alert.alert("Salvataggio non riuscito", "Il percorso è stato seguito, ma non è stato possibile salvarlo.");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading || !route) {
    return (
      <View style={[s.container, { paddingTop: topPad }]}>
        <ActivityIndicator color={colors.accent} size="large" style={{ marginTop: 40 }} />
      </View>
    );
  }

  if (isFinished) {
    return (
      <NavigationFinished
        route={route}
        topPad={topPad}
        bottomPad={bottomPad}
        formatDuration={formatDuration}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic route path
        onSave={saveNavigationTrack}
        onClose={handleClose}
      />
    );
  }

  const steps = activeStepsRef.current ?? route.navigationSteps ?? [];
  const step = steps[currentStep];

  return (
    <View style={s.container}>
      <NavigationMap
        mapUri={mapUri}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WebView ref type
        webViewRef={webViewRef as any}
        handleMapMessage={handleMapMessage}
        handleClose={handleClose}
        isRerouting={isRerouting}
        remainingKm={remainingKm}
        remainingMin={remainingMin}
        topPad={topPad}
        formatDuration={formatDuration}
        minimalMode={minimalMode}
        onToggleMinimal={handleToggleMinimal}
      />

      {/* Progress bar */}
      <View style={s.progressBg}>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- percentage string for width */}
        <View style={[s.progressFill, { width: `${progressPct}%` as any }]} />
      </View>

      <NavigationOfflineBanners
        isOffline={isOffline}
        offline={offline}
        styles={s}
      />

      <NavigationWeather
        topPad={topPad}
        loading={weatherLoading}
        current={currentWeather}
        ahead={aheadWeather}
        rerouting={isRerouting}
        onAvoidWeather={triggerWeatherReroute}
      />

      <NavigationInstruction
        step={step}
        nextStep={steps[currentStep + 1] ?? null}
        distanceToNext={distanceToNext}
        bottomPad={bottomPad}
        signToIcon={signToIcon}
        formatDistance={formatDistance}
        waypoints={route.waypoints}
      />
    </View>
  );
}
