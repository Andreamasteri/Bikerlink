import React from "react";
import { View, Text } from "react-native";
import { MountAxisCalibration } from "@/components/MountCalibWizard";
import { useColors } from "@/hooks/useColors";

interface SensorOverlayPanelProps {
  currentG: number;
  currentLateralG: number;
  currentTiltDeg: number;
  maxAccelG: number;
  mountAxisCalib: MountAxisCalibration | null;
  sensorsEnabled: boolean;
  colors: ReturnType<typeof useColors>["Colors"];
  styles: {
    sensorOverlayPanel: object;
    sensorOverlayItem: object;
    sensorOverlayValue: object;
    sensorOverlayLabel: object;
    sensorOverlaySep: object;
  };
  t: (key: string) => string;
}

export function SensorOverlayPanel({
  currentG,
  currentLateralG,
  currentTiltDeg,
  maxAccelG,
  mountAxisCalib,
  sensorsEnabled,
  colors,
  styles: s,
  t,
}: SensorOverlayPanelProps) {
  const isCalibrated = mountAxisCalib !== null;
  return (
    <View style={[s.sensorOverlayPanel, { flexDirection: "column" as const, alignItems: "stretch" as const }]}>
      <View style={{ flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-around" as const }}>
        <View style={s.sensorOverlayItem}>
          <Text style={[s.sensorOverlayValue, currentG > 0.05 ? { color: colors.success } : currentG < -0.05 ? { color: colors.accentRed } : {}]}>
            {currentG >= 0 ? "+" : ""}{currentG.toFixed(2)}
          </Text>
          <Text style={s.sensorOverlayLabel}>{t("tracking.gLong")}</Text>
        </View>
        <View style={s.sensorOverlaySep} />
        <View style={s.sensorOverlayItem}>
          <Text style={s.sensorOverlayValue}>
            {currentLateralG.toFixed(2)}
          </Text>
          <Text style={s.sensorOverlayLabel}>{t("tracking.gLateral")}</Text>
        </View>
        <View style={s.sensorOverlaySep} />
        <View style={s.sensorOverlayItem}>
          <Text style={[s.sensorOverlayValue, { color: currentTiltDeg < -2 ? colors.accentRed : currentTiltDeg > 2 ? colors.success : colors.accent }]}>
            {currentTiltDeg.toFixed(1)}°
          </Text>
          <Text style={s.sensorOverlayLabel}>{t("tracking.tiltLive")}</Text>
          {/* Tilt arc gauge — mirrors the same ±2° dead-band as the text color */}
          <View style={{ width: 44, height: 4, backgroundColor: colors.border, borderRadius: 2, marginTop: 4, overflow: "hidden" as const }}>
            <View style={{
              width: Math.min(Math.abs(currentTiltDeg) / 60, 1) * 44,
              height: 4,
              backgroundColor: currentTiltDeg < -2 ? colors.accentRed : currentTiltDeg > 2 ? colors.success : colors.accent,
              borderRadius: 2,
            }} />
          </View>
        </View>
        <View style={s.sensorOverlaySep} />
        <View style={s.sensorOverlayItem}>
          <Text style={[s.sensorOverlayValue, { color: colors.accentRed }]}>
            {maxAccelG.toFixed(2)}
          </Text>
          <Text style={s.sensorOverlayLabel}>{t("tracking.gMaxAccel")}</Text>
        </View>
      </View>
      <View style={{ alignItems: "center" as const, marginTop: 7 }}>
        <View style={{
          flexDirection: "row" as const,
          alignItems: "center" as const,
          backgroundColor: isCalibrated ? colors.success + "22" : colors.warning + "22",
          borderRadius: 20,
          paddingHorizontal: 10,
          paddingVertical: 3,
          borderWidth: 1,
          borderColor: isCalibrated ? colors.success + "60" : colors.warning + "55",
        }}>
          <Text style={{
            fontSize: 10,
            fontFamily: "Inter_500Medium" as const,
            color: isCalibrated ? colors.success : colors.warning,
            letterSpacing: 0.2,
          }}>
            {isCalibrated
              ? `${t("tracking.mountCalib.calibratedBadge")} · ${mountAxisCalib.longAxis.toUpperCase()}/${mountAxisCalib.latAxis.toUpperCase()}`
              : t("tracking.mountCalib.chipDefault")}
          </Text>
        </View>
      </View>
    </View>
  );
}
