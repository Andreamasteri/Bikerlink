import { useState, useCallback } from "react";
import { RouteRecord } from "../../components/tracking/useTrackingState";
import { apiRequest } from "@/lib/query-client";
import { Alert } from "react-native";
import { useT } from "@/lib/language-context";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

export function useTrackingMap() {
  const t = useT();
  const [mapModalVisible, setMapModalVisible] = useState(false);
  const [summaryRoutePoints, setSummaryRoutePoints] = useState<Array<{ lat: number; lng: number }>>([]);
  const [routeMapVisible, setRouteMapVisible] = useState(false);
  
  // Historical route viewer
  const [histMapVisible, setHistMapVisible] = useState(false);
  const [histMapPoints, setHistMapPoints] = useState<Array<{ lat: number; lng: number }>>([]);
  const [histMapRecord, setHistMapRecord] = useState<RouteRecord | null>(null);
  const [histMapLoading, setHistMapLoading] = useState(false);

  const handleViewHistoricalRoute = useCallback(async (record: RouteRecord) => {
    setHistMapRecord(record);
    setHistMapVisible(true);
    setHistMapLoading(true);
    try {
      const data = await apiRequest("GET", `/api/routes/${record.id}/points`) as any;
      setHistMapPoints(data.points.map((p: any) => ({ lat: p.latitude, lng: p.longitude })));
    } catch (e) {
      Alert.alert(t("common.error"), t("tracking.loadPointsError"));
      setHistMapVisible(false);
    } finally {
      setHistMapLoading(false);
    }
  }, [t]);

  const handleExportGpx = useCallback(async (id: string) => {
    try {
      const data = await apiRequest("GET", `/api/routes/${id}/gpx`) as any;
      const fileUri = `${FileSystem.cacheDirectory}ride_${id}.gpx`;
      await FileSystem.writeAsStringAsync(fileUri, data.gpx);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert(t("common.error"), t("tracking.sharingNotAvailable"));
      }
    } catch (e) {
      Alert.alert(t("common.error"), t("tracking.exportError"));
    }
  }, [t]);

  return {
    mapModalVisible,
    setMapModalVisible,
    summaryRoutePoints,
    setSummaryRoutePoints,
    routeMapVisible,
    setRouteMapVisible,
    histMapVisible,
    setHistMapVisible,
    histMapPoints,
    setHistMapPoints,
    histMapRecord,
    setHistMapRecord,
    histMapLoading,
    setHistMapLoading,
    handleViewHistoricalRoute,
    handleExportGpx,
  };
}
