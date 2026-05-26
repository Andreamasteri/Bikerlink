import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, TextInput, Platform } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";

interface FilterPanelProps {
  distanceMode: "all" | "km";
  setDistanceMode: (mode: "all" | "km") => void;
  pendingKm: string;
  setPendingKm: (km: string) => void;
  isRematching: boolean;
  isAnyRefetching: boolean;
  onApplyDistance: () => void;
  myLat?: number | null;
  myLng?: number | null;
}

export function FilterPanel({
  distanceMode,
  setDistanceMode,
  pendingKm,
  setPendingKm,
  isRematching,
  isAnyRefetching,
  onApplyDistance,
  myLat,
  myLng,
}: FilterPanelProps) {
  const t = useT();

  return (
    <>
      <View style={styles.distanceFilterRow}>
        <Ionicons name="locate-outline" size={14} color={Colors.textSecondary} />
        <TouchableOpacity
          style={[styles.distanceModeBtn, distanceMode === "all" && styles.distanceModeBtnActive]}
          onPress={() => setDistanceMode("all")}
        >
          <Text style={[styles.distanceModeBtnText, distanceMode === "all" && styles.distanceModeBtnTextActive]}>
            {t("match.distanceFilterAll")}
          </Text>
        </TouchableOpacity>
        
        {distanceMode === "all" && (
          <TouchableOpacity
            style={[styles.distanceKmApplyBtn, (isRematching || isAnyRefetching) && { opacity: 0.6 }]}
            disabled={isRematching || isAnyRefetching}
            onPress={onApplyDistance}
          >
            {isRematching ? (
              <ActivityIndicator size="small" color={Colors.background} />
            ) : (
              <MaterialCommunityIcons name="magnify" size={18} color={Colors.background} />
            )}
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.distanceModeBtn, distanceMode === "km" && styles.distanceModeBtnActive]}
          onPress={() => setDistanceMode("km")}
        >
          <Text style={[styles.distanceModeBtnText, distanceMode === "km" && styles.distanceModeBtnTextActive]}>
            {t("match.distanceFilterKm")}
          </Text>
        </TouchableOpacity>

        {distanceMode === "km" && (
          <>
            <TextInput
              style={styles.distanceKmInput}
              value={pendingKm}
              onChangeText={setPendingKm}
              keyboardType="numeric"
              placeholder={t("match.distanceKmPlaceholder")}
              placeholderTextColor={Colors.textSecondary}
              maxLength={4}
            />
            <TouchableOpacity
              style={[styles.distanceKmApplyBtn, (isRematching || isAnyRefetching) && { opacity: 0.6 }]}
              disabled={isRematching || isAnyRefetching}
              onPress={onApplyDistance}
            >
              {isRematching ? (
                <ActivityIndicator size="small" color={Colors.background} />
              ) : (
                <MaterialCommunityIcons name="magnify" size={18} color={Colors.background} />
              )}
            </TouchableOpacity>
          </>
        )}
      </View>
      {distanceMode === "km" && (myLat == null || myLng == null) && (
        <View style={styles.distanceWarningRow}>
          <Text style={styles.distanceWarning}>{t("match.positionUnavailable")}</Text>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  distanceFilterRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 2,
    gap: 6,
  },
  distanceModeBtn: {
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  distanceModeBtnActive: {
    backgroundColor: Colors.accent + "20",
    borderWidth: 1,
    borderColor: Colors.accent + "40",
  },
  distanceModeBtnText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
    textAlign: "center",
  },
  distanceModeBtnTextActive: {
    color: Colors.accent,
    fontFamily: "Inter_600SemiBold",
  },
  distanceKmInput: {
    flex: 1,
    minWidth: 52,
    maxWidth: 88,
    height: 38,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 0,
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
    textAlign: "center",
    ...Platform.select({
      android: {
        includeFontPadding: false,
      },
    }),
  },
  distanceKmApplyBtn: {
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: Colors.accent,
    justifyContent: "center",
    alignItems: "center",
  },
  distanceWarningRow: {
    paddingHorizontal: 12,
    paddingBottom: 4,
  },
  distanceWarning: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    fontStyle: "italic",
    color: Colors.textSecondary,
  },
});
