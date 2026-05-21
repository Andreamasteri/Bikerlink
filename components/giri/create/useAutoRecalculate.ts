import React, { useEffect } from "react";
import { Alert } from "react-native";

interface AutoRecalculateProps {
  mode: string;
  waypoints: any[];
  style: string;
  drivingProfile: string;
  avoidHighways: boolean;
  avoidTolls: boolean;
  isRoundTrip: boolean;
  roundTripHours: number;
  headingDeg: number | null;
  language?: string;
  autoCalcTimeout: React.MutableRefObject<any>;
  setCalculating: (v: boolean) => void;
  setRouteResult: (res: any) => void;
  setDismissedWarnings: (s: any) => void;
  calcRoute: any;
}

export const useAutoRecalculate = ({
  mode,
  waypoints,
  style,
  drivingProfile,
  avoidHighways,
  avoidTolls,
  isRoundTrip,
  roundTripHours,
  headingDeg,
  language,
  autoCalcTimeout,
  setCalculating,
  setRouteResult,
  setDismissedWarnings,
  calcRoute,
}: AutoRecalculateProps) => {
  useEffect(() => {
    if (mode !== "manual") return;
    const resolved = waypoints.filter((wp) => wp.lat !== 0 || wp.lng !== 0);
    if (resolved.length < 2) return;
    if (autoCalcTimeout.current) clearTimeout(autoCalcTimeout.current);
    autoCalcTimeout.current = setTimeout(async () => {
      const toCalc = isRoundTrip ? [...resolved, resolved[0]] : resolved;
      setCalculating(true);
      try {
        const result = await calcRoute(toCalc, style, drivingProfile, avoidHighways, avoidTolls, false, false, roundTripHours, isRoundTrip, headingDeg, language);
        setRouteResult(result);
        setDismissedWarnings(new Set());
      } catch {
        // silent
      } finally {
        setCalculating(false);
      }
    }, 500);
    return () => { if (autoCalcTimeout.current) clearTimeout(autoCalcTimeout.current); };
  }, [waypoints, style, drivingProfile, avoidHighways, avoidTolls, isRoundTrip, roundTripHours, headingDeg, mode]);
};
