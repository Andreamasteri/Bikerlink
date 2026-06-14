import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

function formatCalibrationDate(ts: number): string {
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  const HH = String(d.getHours()).padStart(2, "0");
  const MM = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yy} ${HH}:${MM}`;
}

export function CalibrationBanner({
  isCalibrated,
  onCalibrate,
  calibrationTimestamp,
}: {
  isCalibrated: boolean;
  onCalibrate: () => void;
  calibrationTimestamp?: number | null;
}) {
  if (isCalibrated) {
    const dateLabel = calibrationTimestamp
      ? formatCalibrationDate(calibrationTimestamp)
      : null;
    return (
      <View style={bannerStyles.calibratedHint}>
        <View style={{ flex: 1 }}>
          <Text style={bannerStyles.calibratedHintText}>
            Hai già calibrato la posizione del telefono. Ricalibrala in caso venga montato in modo diverso.
          </Text>
          {dateLabel ? (
            <Text style={bannerStyles.calibratedTimestamp}>
              Ultima calibrazione: {dateLabel}
            </Text>
          ) : null}
        </View>
        <TouchableOpacity
          style={bannerStyles.recalibrateBtn}
          onPress={onCalibrate}
          activeOpacity={0.75}
        >
          <Ionicons name="refresh-outline" size={11} color={Colors.success} />
          <Text style={bannerStyles.recalibrateBtnText}>Ricalibrare</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={bannerStyles.warningBanner}>
      <View style={bannerStyles.warningLeft} />
      <View style={bannerStyles.bannerContent}>
        <View style={bannerStyles.bannerRow}>
          <Ionicons name="warning-outline" size={18} color={Colors.warning} />
          <Text style={bannerStyles.warningTitle}>Calibra la posizione del telefono</Text>
        </View>
        <Text style={bannerStyles.bannerDesc}>
          Monta il telefono sul supporto manubrio prima di partire, poi esegui la
          calibrazione. Serve a misurare correttamente accelerazione, frenata,
          angolo di piega e G-force laterale.
        </Text>
        <TouchableOpacity
          style={bannerStyles.primaryBtn}
          onPress={onCalibrate}
          activeOpacity={0.85}
        >
          <Ionicons name="compass-outline" size={15} color="#fff" />
          <Text style={bannerStyles.primaryBtnText}>Calibra ora</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export const bannerStyles = StyleSheet.create({
  warningBanner: {
    flexDirection: "row",
    backgroundColor: Colors.warning + "18",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.warning + "55",
    overflow: "hidden",
  },
  warningLeft: {
    width: 4,
    backgroundColor: Colors.warning,
  },
  bannerContent: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 6,
  },
  bannerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  warningTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: Colors.warning,
    flex: 1,
  },
  bannerDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 17,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: Colors.warning,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 16,
    alignSelf: "flex-start",
    marginTop: 2,
  },
  primaryBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: "#fff",
  },
  calibratedHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  calibratedHintText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  calibratedTimestamp: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    color: Colors.success,
    marginTop: 3,
  },
  recalibrateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: Colors.success + "66",
  },
  recalibrateBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: Colors.success,
  },
});
