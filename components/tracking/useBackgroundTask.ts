import { useState, useRef } from "react";
import { Animated } from "react-native";

export function useBackgroundTask() {
  const bgTrackingActiveRef = useRef(false);
  const bgStartGenRef = useRef(0);
  const bgStartPointsRef = useRef(0);
  const bgPointsCountRef = useRef(0);
  const bgToastAnim = useRef(new Animated.Value(0)).current;
  const bgToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [bgToastCount, setBgToastCount] = useState(0);
  const [bgToastVisible, setBgToastVisible] = useState(false);
  const pendingBgToastCountRef = useRef(0);

  return {
    bgTrackingActiveRef,
    bgStartGenRef,
    bgStartPointsRef,
    bgPointsCountRef,
    bgToastAnim,
    bgToastTimerRef,
    bgToastCount,
    setBgToastCount,
    bgToastVisible,
    setBgToastVisible,
    pendingBgToastCountRef,
  };
}
