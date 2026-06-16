import React, { useEffect } from "react";

interface AutoRecalculateProps {
  mode: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- waypoints before full typing
  waypoints: any[];
  style: string;
  drivingProfile: string;
  avoidHighways: boolean;
  avoidTolls: boolean;
  isRoundTrip: boolean;
  roundTripHours: number;
  headingDeg: number | null;
  language?: string;
  geocodingOk?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- timeout ref
  autoCalcTimeout: React.MutableRefObject<any>;
  setCalculating: (v: boolean) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- route result shape
  setRouteResult: (res: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dismissed warnings Set
  setDismissedWarnings: (s: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- calcRoute function from api.ts
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
  geocodingOk,
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
        const result = await calcRoute(toCalc, style, drivingProfile, avoidHighways, avoidTolls, false, false, false, roundTripHours, isRoundTrip, headingDeg, language, undefined, geocodingOk);
        setRouteResult(result);
        setDismissedWarnings(new Set());
      } catch {
        // silent
      } finally {
        setCalculating(false);
      }
    }, 500);
    return () => { if (autoCalcTimeout.current) clearTimeout(autoCalcTimeout.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waypoints, style, drivingProfile, avoidHighways, avoidTolls, isRoundTrip, roundTripHours, headingDeg, mode]);
};
