import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";
import { getApiUrl, authFetchHeaders } from "@/lib/query-client";
import { formatDistance, formatSpeed } from "@/lib/units";
import { DistanceUnit, SpeedUnit } from "@/lib/units-context";
import { formatHMS, buildLeafletPostRideHtml } from "./tracking-utils";

interface RouteMapModalProps {
  visible: boolean;
  onClose: () => void;
  onCloseAll: () => void;
  points: Array<{ lat: number; lng: number }>;
  tileUrl: string;
  tileMaxZoom: number;
  totalKm: number;
  maxSpeed: number;
  totalMs: number;
  distanceUnit: DistanceUnit;
  speedUnit: SpeedUnit;
  insets: { top: number; bottom: number };
  loading?: boolean;
  routeId?: string | null;
}

export function RouteMapModal({
  visible, onClose, onCloseAll: _onCloseAll, points, tileUrl, tileMaxZoom,
  totalKm, maxSpeed, totalMs, distanceUnit, speedUnit, insets, loading, routeId,
}: RouteMapModalProps) {
  const t = useT();
  const [isExporting, setIsExporting] = useState(false);

  const handleExportGpx = async () => {
    if (!routeId || isExporting) return;
    setIsExporting(true);
    try {
      const url = new URL(`/api/routes/${routeId}/export.gpx`, getApiUrl()).href;
      const resp = await fetch(url, { headers: authFetchHeaders(), credentials: "include" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const gpxText = await resp.text();
      const safeName = routeId.replace(/[^a-zA-Z0-9_\-]/g, "_").slice(0, 60);
      const fileUri = `${FileSystem.cacheDirectory}${safeName}.gpx`;
      await FileSystem.writeAsStringAsync(fileUri, gpxText, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: "application/gpx+xml",
          dialogTitle: t("tracking.exportGpx"),
          UTI: "com.topografix.gpx",
        });
      } else {
        Alert.alert("GPX", fileUri);
      }
    } catch (err) {
      console.warn("[BikerLink] GPX export error:", err);
      Alert.alert(t("common.error"), t("tracking.exportGpxError"));
    } finally {
      setIsExporting(false);
    }
  };

  const html = useMemo(
    () => buildLeafletPostRideHtml(tileUrl, tileMaxZoom, Colors.accent, points),
    [tileUrl, tileMaxZoom, points]
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        {/* Header */}
        <View style={{
          paddingTop: insets.top + 12,
          paddingBottom: 12,
          paddingHorizontal: 16,
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: Colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: Colors.border,
        }}>
          <Ionicons name="map-outline" size={20} color={Colors.accent} />
          <Text style={{
            flex: 1,
            marginLeft: 8,
            fontFamily: "Inter_600SemiBold",
            fontSize: 16,
            color: Colors.text,
          }}>{t("tracking.myRoute")}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={24} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Map */}
        <View style={{ flex: 1 }}>
          {loading ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#1a1a1a" }}>
              <ActivityIndicator size="large" color={Colors.accent} />
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.textSecondary, marginTop: 12 }}>
                {t("tracking.loadingRoute")}
              </Text>
            </View>
          ) : points.length === 0 ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#1a1a1a" }}>
              <Ionicons name="map-outline" size={48} color={Colors.textSecondary} />
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.textSecondary, marginTop: 12 }}>
                {t("tracking.noRoute")}
              </Text>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, marginTop: 4, textAlign: "center", paddingHorizontal: 32 }}>
                {t("tracking.noGpsPoints")}
              </Text>
            </View>
          ) : (
            <WebView
              source={{ html, baseUrl: "" }}
              style={{ flex: 1, backgroundColor: "#1a1a1a" }}
              javaScriptEnabled
              domStorageEnabled
              originWhitelist={["https://*", "http://*", "about:*"]}
              scrollEnabled={false}
              bounces={false}
              overScrollMode="never"
              cacheEnabled={false}
            />
          )}
        </View>

        {/* Stats bar + actions */}
        <View style={{
          backgroundColor: Colors.surface,
          borderTopWidth: 1,
          borderTopColor: Colors.border,
          paddingBottom: insets.bottom + 8,
        }}>
          <View style={{
            flexDirection: "row",
            justifyContent: "space-around",
            paddingVertical: 14,
            paddingHorizontal: 16,
          }}>
            {[
              { icon: "navigate-outline" as const, label: t("tracking.distance"), value: formatDistance(totalKm, distanceUnit, 2) },
              { icon: "flash" as const, label: t("tracking.maxSpeed"), value: formatSpeed(maxSpeed, speedUnit, 1) },
              { icon: "time-outline" as const, label: t("tracking.duration"), value: formatHMS(totalMs) },
            ].map((s) => (
              <View key={s.label} style={{ alignItems: "center", flex: 1 }}>
                <Ionicons name={s.icon} size={18} color={Colors.accent} />
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: Colors.text, marginTop: 2 }}>{s.value}</Text>
                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary }}>{s.label}</Text>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingBottom: 4 }}>
            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.8}
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 12,
                borderRadius: 12,
                backgroundColor: Colors.surfaceLight,
              }}
            >
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.textSecondary }}>
                {t("tracking.backToRide")}
              </Text>
            </TouchableOpacity>
            {!!routeId && (
              <TouchableOpacity
                onPress={handleExportGpx}
                activeOpacity={0.8}
                style={{
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                  paddingVertical: 12,
                  borderRadius: 12,
                  backgroundColor: Colors.surfaceLight,
                  opacity: isExporting ? 0.5 : 1,
                }}
                disabled={isExporting}
              >
                {isExporting ? (
                  <ActivityIndicator size="small" color={Colors.accent} />
                ) : (
                  <>
                    <Ionicons name="download-outline" size={18} color={Colors.accent} style={{ marginBottom: 2 }} />
                    <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.accent }}>
                      GPX
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}
