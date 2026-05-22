import { haversineDistance } from "../geo";
import { type Proposal } from "@shared/schema";
import { sameDay, timeRangesOverlap, MATCH_RULES } from "./filters";

type ProposalWithAuthor = Proposal & { authorUserType?: string | null };

export function deriveTargetUserTypes(p: ProposalWithAuthor): string[] {
  const explicit = Array.isArray(p.targetUserTypes) ? (p.targetUserTypes as string[]) : null;
  if (explicit && explicit.length > 0) return explicit;
  switch (p.searchType) {
    case "find_a_friend":  return ["biker", "coppia"];
    case "find_a_biker":   return ["zavorrina", "coppia"];
    case "find_a_guest":   return ["biker", "coppia"];
    case "hitchhiker":     return ["zavorrina", "coppia"];
    case "hitcher":        return ["biker", "coppia"];
    default:               return ["biker", "zavorrina", "coppia"];
  }
}

export function getAllSearchTypes(p: ProposalWithAuthor): string[] {
  const types: string[] = [];
  if (Array.isArray(p.searchTypes)) {
    for (const t of p.searchTypes as string[]) {
      if (t && !types.includes(t)) types.push(t);
    }
  }
  if (p.searchType && !types.includes(p.searchType)) {
    types.push(p.searchType);
  }
  return types;
}

export function resolveMatchPool(p1: ProposalWithAuthor, p2: ProposalWithAuthor): boolean {
  const hasExplicit1 = Array.isArray(p1.targetUserTypes) && (p1.targetUserTypes as string[]).length > 0;
  const hasExplicit2 = Array.isArray(p2.targetUserTypes) && (p2.targetUserTypes as string[]).length > 0;

  if (!hasExplicit1 && !hasExplicit2) {
    const types1 = getAllSearchTypes(p1);
    const types2 = getAllSearchTypes(p2);
    if (types1.length === 0 || types2.length === 0) return false;
    return MATCH_RULES.some(
      (r) =>
        (types1.includes(r.searchType1) && types2.includes(r.searchType2)) ||
        (types1.includes(r.searchType2) && types2.includes(r.searchType1))
    );
  }

  const targets1 = deriveTargetUserTypes(p1);
  const targets2 = deriveTargetUserTypes(p2);
  const type1 = p1.authorUserType ?? "biker";
  const type2 = p2.authorUserType ?? "biker";
  return targets1.includes(type2) && targets2.includes(type1);
}

export function routesIntersect(p1: ProposalWithAuthor, p2: ProposalWithAuthor): boolean {
  if (
    p1.departureLatitude != null && p1.departureLongitude != null &&
    p2.departureLatitude != null && p2.departureLongitude != null
  ) {
    const distance = haversineDistance(
      p1.departureLatitude, p1.departureLongitude,
      p2.departureLatitude, p2.departureLongitude
    );
    const radius1 = p1.searchRadius || 50;
    const radius2 = p2.searchRadius || 50;
    if (distance <= Math.min(radius1, radius2)) return true;
  }

  if (
    p1.extendToDestination &&
    p1.destinationLatitude != null && p1.destinationLongitude != null &&
    p2.departureLatitude != null && p2.departureLongitude != null
  ) {
    const destRadius1 = p1.destinationSearchRadius || 30;
    const distDest1 = haversineDistance(
      p1.destinationLatitude, p1.destinationLongitude,
      p2.departureLatitude, p2.departureLongitude
    );
    if (distDest1 <= destRadius1) return true;
  }

  if (
    p2.extendToDestination &&
    p2.destinationLatitude != null && p2.destinationLongitude != null &&
    p1.departureLatitude != null && p1.departureLongitude != null
  ) {
    const destRadius2 = p2.destinationSearchRadius || 30;
    const distDest2 = haversineDistance(
      p2.destinationLatitude, p2.destinationLongitude,
      p1.departureLatitude, p1.departureLongitude
    );
    if (distDest2 <= destRadius2) return true;
  }

  return false;
}

export function areCompatible(p1: ProposalWithAuthor, p2: ProposalWithAuthor): boolean {
  if (p1.userId === p2.userId) return false;
  if (!resolveMatchPool(p1, p2)) return false;

  const date1 = p1.scheduledAt || p1.departureTimeFrom;
  const date2 = p2.scheduledAt || p2.departureTimeFrom;
  if (!sameDay(date1, date2)) return false;
  if (!timeRangesOverlap(p1.departureTimeFrom, p1.departureTimeTo, p2.departureTimeFrom, p2.departureTimeTo)) return false;

  return routesIntersect(p1, p2);
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
