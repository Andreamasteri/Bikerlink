import { useState, useRef, useCallback } from "react";
import { Alert } from "react-native";
import { apiRequest } from "@/lib/query-client";
import { useT } from "@/lib/language-context";
import { RouteRecord } from "../../components/tracking/useTrackingState";

export function useTrackingStats() {
  const t = useT();
  const [totalMs, setTotalMs] = useState(0);
  const [displayIdleMs, setDisplayIdleMs] = useState(0);
  const [avgSpeedDisplayKmh, setAvgSpeedDisplayKmh] = useState(0);
  
  const [pointsSent, setPointsSent] = useState(0);
  const [pointsBuffered, setPointsBuffered] = useState(0);

  const startTimeRef = useRef(0);
  const pausedMsRef = useRef(0);
  const pauseStartRef = useRef(0);
  const isPausedRef = useRef(false);
  
  const totalPointsSentRef = useRef(0);
  const idleMsRef = useRef(0);
  const idleStartRef = useRef<number | null>(null);
  const isIdleRef = useRef(false);
  const lastAvgSpeedUpdateRef = useRef(0);

  const handleDeleteRecord = useCallback(async (id: string, refetchRecords: () => void) => {
    Alert.alert(t("common.confirm"), t("tracking.deleteConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: async () => {
          try {
            await apiRequest("DELETE", `/api/routes/${id}`);
            refetchRecords();
          } catch (e) {
            Alert.alert(t("common.error"), t("tracking.deleteError"));
          }
        },
      },
    ]);
  }, [t]);

  return {
    totalMs,
    setTotalMs,
    displayIdleMs,
    setDisplayIdleMs,
    avgSpeedDisplayKmh,
    setAvgSpeedDisplayKmh,
    pointsSent,
    setPointsSent,
    pointsBuffered,
    setPointsBuffered,
    startTimeRef,
    pausedMsRef,
    pauseStartRef,
    isPausedRef,
    totalPointsSentRef,
    idleMsRef,
    idleStartRef,
    isIdleRef,
    lastAvgSpeedUpdateRef,
    handleDeleteRecord,
  };
}
