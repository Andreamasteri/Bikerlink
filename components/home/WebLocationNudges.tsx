import React from "react";
import { View, Text, TouchableOpacity, Linking, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";

interface WebLocationNudgesProps {
  showLocationNudge: boolean;
  onDismissNudge: () => void;
  webMobilePosition: { latitude: number; longitude: number } | null;
  webPhonePositionStatus: string | null;
  onSetLocation: (pos: { latitude: number; longitude: number }) => void;
  onFocusCoordinate: (pos: { latitude: number; longitude: number }) => void;
  t: (key: string) => string;
}

export const WebLocationNudges: React.FC<WebLocationNudgesProps> = ({
  showLocationNudge,
  onDismissNudge,
  webMobilePosition,
  webPhonePositionStatus,
  onSetLocation,
  onFocusCoordinate,
  t,
}) => {
  if (Platform.OS !== "web") return null;

  return (
    <>
      {showLocationNudge && (
        <View style={styles.locationNudge}>
          <View style={styles.locationNudgeContent}>
            <Ionicons name="location-outline" size={18} color="#F59E0B" style={{ marginTop: 1 }} />
            <Text style={styles.locationNudgeText}>{t("home.locationNudge")}</Text>
          </View>
          <View style={styles.locationNudgeActions}>
            <TouchableOpacity
              style={styles.locationNudgeHowBtn}
              onPress={() => Linking.openURL("https://support.google.com/chrome/answer/142065")}
            >
              <Text style={styles.locationNudgeHowText}>{t("home.locationNudgeHow")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.locationNudgeDismissBtn}
              onPress={async () => {
                onDismissNudge();
                await AsyncStorage.setItem("location_nudge_dismissed", "1").catch(() => {});
              }}
            >
              <Ionicons name="close" size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
      )}
      {webMobilePosition != null && webPhonePositionStatus === "live" && (
        <TouchableOpacity
          style={styles.webMobilePositionBtn}
          onPress={() => {
            onSetLocation(webMobilePosition);
            onFocusCoordinate(webMobilePosition);
          }}
        >
          <Text style={styles.webMobilePositionBtnText}>📍 Dal telefono</Text>
        </TouchableOpacity>
      )}
      {webPhonePositionStatus === "stale" && (
        <View style={[styles.webMobilePositionBtn, { borderColor: "#F59E0B" }]}>
          <Text style={[styles.webMobilePositionBtnText, { color: "#F59E0B" }]}>
            ⚠ Posizione non disponibile — apri l'app sul telefono
          </Text>
        </View>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  locationNudge: {
    margin: 16,
    padding: 12,
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.2)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  locationNudgeContent: {
    flexDirection: "row",
    flex: 1,
    marginRight: 12,
  },
  locationNudgeText: {
    fontSize: 13,
    color: Colors.text,
    marginLeft: 8,
    flex: 1,
  },
  locationNudgeActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  locationNudgeHowBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "rgba(245, 158, 11, 0.2)",
    borderRadius: 8,
    marginRight: 8,
  },
  locationNudgeHowText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#D97706",
  },
  locationNudgeDismissBtn: {
    padding: 4,
  },
  webMobilePositionBtn: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 12,
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
  },
  webMobilePositionBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.text,
  },
});
