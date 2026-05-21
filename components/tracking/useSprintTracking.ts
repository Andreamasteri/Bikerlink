import { useState, useRef } from "react";
import { Animated } from "react-native";

export function useSprintTracking() {
  const [sprintPhase, setSprintPhase] = useState<"waiting" | "measuring" | "done">("waiting");
  const [sprintGoFired, setSprintGoFired] = useState(false);
  const [sprint0to100Ms, setSprint0to100Ms] = useState<number | null>(null);
  const [isNewRecord, setIsNewRecord] = useState(false);
  const recordAnim = useRef(new Animated.Value(0)).current;
  const personalBestMsRef = useRef<number | null>(null);
  const sprintStartTimeRef = useRef<number | null>(null);
  const sprintPhaseRef = useRef<"waiting" | "measuring" | "done">("waiting");
  const sprintTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sprint0to100MsRef = useRef<number | null>(null);

  return {
    sprintPhase,
    setSprintPhase,
    sprintGoFired,
    setSprintGoFired,
    sprint0to100Ms,
    setSprint0to100Ms,
    isNewRecord,
    setIsNewRecord,
    recordAnim,
    personalBestMsRef,
    sprintStartTimeRef,
    sprintPhaseRef,
    sprintTimeoutRef,
    sprint0to100MsRef,
  };
}
