/**
 * Task #2528 — Derivazione tag automatica per planned_routes.
 *
 * Usa curvy-score, durata, dislivello e distanza per assegnare tag come
 * `route:thrilling`, `route:tourist`, `route:long-distance`, `route:mountain`.
 *
 * I tag tornano sotto forma di array stringhe e vengono salvati in
 * `planned_routes.derived_tags`. Sono normalizzati lowercase senza spazi.
 */

export interface RouteForTagging {
  distanceKm?: number | null;
  durationMinutes?: number | null;
  bikerScore?: number | null;
  curvyScoreAvg?: number | null;
  elevationGainM?: number | null;
  altitudeMaxM?: number | null;
  isMultiDay?: boolean | null;
  style?: string | null;
}

export function deriveRouteTags(route: RouteForTagging): string[] {
  const tags = new Set<string>();
  const curvy = route.curvyScoreAvg ?? route.bikerScore ?? null;
  const dist = route.distanceKm ?? 0;
  const dur = route.durationMinutes ?? 0;
  const elev = route.elevationGainM ?? 0;
  const altMax = route.altitudeMaxM ?? 0;

  if (curvy != null) {
    if (curvy >= 0.65) tags.add("route:thrilling");
    else if (curvy >= 0.4) tags.add("route:curvy");
    else if (curvy <= 0.2) tags.add("route:fast");
  }
  if (dist >= 300) tags.add("route:long-distance");
  if (dist >= 800 || route.isMultiDay) tags.add("route:multi-day");
  if (dur > 0 && dur <= 180 && dist <= 120) tags.add("route:short");
  if (elev >= 1500 || altMax >= 1500) tags.add("route:mountain");
  if (altMax >= 2200) tags.add("route:high-altitude");
  if (curvy != null && curvy < 0.35 && dist >= 80 && dist <= 250) tags.add("route:tourist");
  if (route.style === "fast") tags.add("route:fast");
  if (route.style === "curvy") tags.add("route:curvy");

  return Array.from(tags);
}
