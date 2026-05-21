import React from "react";
import { FilterPanel } from "@/components/match/FilterPanel";

interface MatchFiltersPanelProps {
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

export const MatchFiltersPanel: React.FC<MatchFiltersPanelProps> = (props) => {
  return <FilterPanel {...props} />;
};
