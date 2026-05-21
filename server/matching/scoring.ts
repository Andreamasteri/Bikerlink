import { haversineDistance } from "../geo";
import { type Proposal } from "@shared/schema";
import { sameDay, timeRangesOverlap, MATCH_RULES } from "./filters";

export function areCompatible(p1: Proposal, p2: Proposal): boolean {
  if (!p1.searchType || !p2.searchType) return false;
  if (p1.userId === p2.userId) return false;

  const ruleMatch = MATCH_RULES.some(
    (r) =>
      (r.searchType1 === p1.searchType && r.searchType2 === p2.searchType) ||
      (r.searchType1 === p2.searchType && r.searchType2 === p1.searchType)
  );
  if (!ruleMatch) return false;

  const date1 = p1.scheduledAt || p1.departureTimeFrom;
  const date2 = p2.scheduledAt || p2.departureTimeFrom;
  if (!sameDay(date1, date2)) return false;

  if (!timeRangesOverlap(p1.departureTimeFrom, p1.departureTimeTo, p2.departureTimeFrom, p2.departureTimeTo)) return false;

  if (p1.departureLatitude != null && p1.departureLongitude != null && p2.departureLatitude != null && p2.departureLongitude != null) {
    const distance = haversineDistance(
      p1.departureLatitude, p1.departureLongitude,
      p2.departureLatitude, p2.departureLongitude
    );
    const radius1 = p1.searchRadius || 50;
    const radius2 = p2.searchRadius || 50;
    if (distance <= Math.min(radius1, radius2)) return true;
  }

  if (p1.extendToDestination && p1.destinationLatitude != null && p1.destinationLongitude != null && p2.departureLatitude != null && p2.departureLongitude != null) {
    const destRadius1 = p1.destinationSearchRadius || 30;
    const distDest1 = haversineDistance(p1.destinationLatitude, p1.destinationLongitude, p2.departureLatitude, p2.departureLongitude);
    if (distDest1 <= destRadius1) return true;
  }

  if (p2.extendToDestination && p2.destinationLatitude != null && p2.destinationLongitude != null && p1.departureLatitude != null && p1.departureLongitude != null) {
    const destRadius2 = p2.destinationSearchRadius || 30;
    const distDest2 = haversineDistance(p2.destinationLatitude, p2.destinationLongitude, p1.departureLatitude, p1.departureLongitude);
    if (distDest2 <= destRadius2) return true;
  }

  return false;
}

export function baseModelName(model: string): string {
  return model.toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function routeProfileOf(avgSpeed: number, avgTilt: number, avgDist: number): string {
  if (avgTilt > 30) return "curvy";
  if (avgSpeed > 100) return "highway";
  if (avgDist < 30) return "city";
  return "mixed";
}
