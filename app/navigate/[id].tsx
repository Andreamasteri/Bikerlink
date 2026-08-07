import React from "react";
import { View, ActivityIndicator } from "react-native";
import { NavigationMap } from "@/components/navigate/NavigationMap";
import { NavigationInstruction } from "@/components/navigate/NavigationInstruction";
import { NavigationWeather } from "@/components/navigate/NavigationWeather";
import { NavigationFinished } from "@/components/navigate/NavigationFinished";
import { NavigationOfflineBanners } from "@/components/navigate/NavigationOfflineBanners";
import { signToIcon, formatDistance, formatDuration } from "@/components/navigate/navigate-helpers";
import { makeStyles } from "@/components/navigate/[id].styles";
import { useNavigateState } from "@/hooks/navigate/useNavigateState";
import { useRouter } from "expo-router";

export default function NavigateScreen() {
  const router = useRouter();
  const {
    colors, topPad, bottomPad, webViewRef,
    route, isLoading, isFinished,
    currentStep, distanceToNext, progressPct, remainingKm, remainingMin,
    isRerouting, isOffline, weatherLoading, currentWeather, aheadWeather,
    mapUri, offline, activeStepsRef,
    minimalMode, handleToggleMinimal,
    handleMapMessage, handleVoiceCommand, handleClose, triggerWeatherReroute,
  } = useNavigateState();

  const s = makeStyles(colors);

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
        onSave={() => router.replace(`/route/tracking` as any)}
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
