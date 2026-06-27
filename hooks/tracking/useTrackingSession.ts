import { useState, useRef, useEffect, useCallback } from "react";
import { Phase, RouteRecord, LocalRouteRecord } from "../../components/tracking/useTrackingState";
import { Animated, Alert } from "react-native";
import { apiRequest, queryClient } from "@/lib/query-client";
import { useT } from "@/lib/language-context";
import { useMutation } from "@tanstack/react-query";

export function useTrackingSession() {
  const t = useT();
  const [phase, setPhase] = useState<Phase>("idle");
  const phaseRef = useRef<Phase>("idle");
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const [loading, setLoading] = useState(false);
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [summaryPatchFailed, setSummaryPatchFailed] = useState(false);
  const [rideTitle, setRideTitle] = useState<string>("");
  const [completedRouteId, setCompletedRouteId] = useState<string | null>(null);
  const [recoveredRecords, setRecoveredRecords] = useState<LocalRouteRecord[]>([]);
  
  // Publish state
  const [publishRecord, setPublishRecord] = useState<RouteRecord | null>(null);
  const [publishCaption, setPublishCaption] = useState("");

  // Countdown
  const [countdownValue, setCountdownValue] = useState(0);
  const countdownAnim = useRef(new Animated.Value(1)).current;

  // Mutations
  const publishMutation = useMutation({
    mutationFn: async (data: { performanceData: string; caption: string }) => {
      await apiRequest("POST", "/api/contest/entries", data);
    },
    onSuccess: () => {
      setPublishRecord(null);
      setPublishCaption("");
      queryClient.invalidateQueries({ queryKey: ["/api/contest/entries"] });
      Alert.alert(t("tracking.published"), t("tracking.publishedMsg"));
    },
    onError: () => Alert.alert(t("common.error"), t("tracking.publishError")),
  });

  const publishMutationRef = useRef(publishMutation);
  publishMutationRef.current = publishMutation;

  const handlePublish = useCallback(async () => {
    if (!publishRecord) return;
    const perfData = JSON.stringify({
      routeId: publishRecord.id,
      distanceKm: publishRecord.totalDistanceKm,
      maxSpeedKmh: publishRecord.maxSpeedKmh,
      avgSpeedKmh: publishRecord.avgSpeedKmh,
      durationSeconds: publishRecord.durationSeconds,
      isSprint: publishRecord.isSprint,
      sprint0to100Ms: publishRecord.sprint0to100Ms,
      maxAccelerationG: publishRecord.maxAccelerationG,
    });
    publishMutationRef.current.mutate({ performanceData: perfData, caption: publishCaption });
  }, [publishRecord, publishCaption]);

  return {
    phase,
    setPhase,
    phaseRef,
    loading,
    setLoading,
    summaryVisible,
    setSummaryVisible,
    summaryPatchFailed,
    setSummaryPatchFailed,
    rideTitle,
    setRideTitle,
    completedRouteId,
    setCompletedRouteId,
    recoveredRecords,
    setRecoveredRecords,
    publishRecord,
    setPublishRecord,
    publishCaption,
    setPublishCaption,
    countdownValue,
    setCountdownValue,
    countdownAnim,
    handlePublish,
    isPublishPending: publishMutation.isPending,
  };
}
