import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { plannedRoutes, plannedRouteInvites, users, userProfiles, matchPreferences } from "@shared/db";
import { storage } from "../storage";
import { loadMatchingDisabledSet } from "./filters";
import { sendPlannedRouteInvitePushNotifications } from "../push-notifications";

const LIVE_MAX_AGE_MS = 5 * 60_000;
const PROFILE_MAX_AGE_MS = 10 * 60_000;
const DYNAMIC_RADIUS_KM = 25;
const STATIC_RADIUS_KM = 50;
const MAX_ROUTES = 200;
const MAX_INVITES_PER_ROUTE = 10;

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

type LiveState = {
  event?: string;
  latitude?: number | null;
  longitude?: number | null;
  positionKnown?: boolean;
  positionSource?: string;
  locationAgeMs?: number | null;
  eventAt?: string;
};

function readLive(metadata: unknown): LiveState | null {
  if (!metadata || typeof metadata !== "object") return null;
  const live = (metadata as Record<string, unknown>).live;
  return live && typeof live === "object" ? live as LiveState : null;
}

function routeTargets(route: { waypoints: unknown }, dynamicPoint: { latitude: number; longitude: number } | null) {
  if (dynamicPoint) return [dynamicPoint];
  const waypoints = Array.isArray(route.waypoints) ? route.waypoints : [];
  const start = waypoints.find((wp): wp is { lat: number; lng: number } => {
    if (!wp || typeof wp !== "object") return false;
    const item = wp as Record<string, unknown>;
    return typeof item.lat === "number" && typeof item.lng === "number" && (item.lat !== 0 || item.lng !== 0);
  });
  return start ? [{ latitude: start.lat, longitude: start.lng }] : [];
}

export interface LiveRouteMatchingResult {
  routesProcessed: number;
  invitesCreated: number;
  dynamicMatches: number;
  staticMatches: number;
}

export async function runLiveRouteMatching(): Promise<LiveRouteMatchingResult> {
  const routes = await db
    .select({
      id: plannedRoutes.id,
      userId: plannedRoutes.userId,
      waypoints: plannedRoutes.waypoints,
      metadata: plannedRoutes.metadata,
      visibility: plannedRoutes.visibility,
    })
    .from(plannedRoutes)
    .where(inArray(plannedRoutes.visibility, ["public", "community"]))
    .limit(MAX_ROUTES);

  const profiles = await db
    .select({
      userId: userProfiles.userId,
      latitude: userProfiles.latitude,
      longitude: userProfiles.longitude,
      updatedAt: userProfiles.coordinatesUpdatedAt,
    })
    .from(userProfiles)
    .innerJoin(users, eq(users.id, userProfiles.userId))
    .where(and(eq(users.status, "active"), eq(users.isFake, false)));

  const prefsRows = await db.select({ userId: matchPreferences.userId, enabled: matchPreferences.plannedRouteInvite }).from(matchPreferences);
  const allow = new Map(prefsRows.map((row) => [row.userId, row.enabled !== false]));
  const disabled = await loadMatchingDisabledSet();
  const blocked = await storage.getAllBlockedPairs().catch(() => []);
  const blockedSet = new Set(blocked.flatMap((pair) => [pair.blockerId + ":" + pair.blockedId, pair.blockedId + ":" + pair.blockerId]));

  let invitesCreated = 0;
  let dynamicMatches = 0;
  let staticMatches = 0;
  let routesProcessed = 0;

  for (const route of routes) {
    const live = readLive(route.metadata);
    const metadata = route.metadata && typeof route.metadata === "object" ? route.metadata as Record<string, unknown> : {};
    const departureAt = typeof metadata.departureAt === "string" ? Date.parse(metadata.departureAt) : NaN;
    const eventAt = live?.eventAt ? Date.parse(live.eventAt) : NaN;
    const liveEvent = live?.event ?? null;
    const liveCandidateEvent = ["start", "position", "waypoint", "off_route"].includes(liveEvent ?? "");
    const dynamic = !!live
      && live.positionKnown === true
      && Number.isFinite(live.latitude)
      && Number.isFinite(live.longitude)
      && liveCandidateEvent
      && Number.isFinite(eventAt)
      && Date.now() - eventAt <= LIVE_MAX_AGE_MS;
    // Un viaggio già concluso, fermato o con telemetria live scaduta non torna
    // statico: la posizione non è sufficientemente affidabile per una proposta.
    if (liveEvent === "arrived" || liveEvent === "stopped" || (liveCandidateEvent && !dynamic)) continue;
    // Una proposta statica resta valida fino a 30 minuti dopo l’orario previsto;
    // oltre quel limite il viaggio va aggiornato dal proprietario o marcato live.
    if (!dynamic && Number.isFinite(departureAt) && Date.now() - departureAt > 30 * 60_000) continue;
    const targets = routeTargets(route, dynamic ? { latitude: live!.latitude!, longitude: live!.longitude! } : null);
    if (targets.length === 0) continue;

    if (allow.get(route.userId) === false || disabled.has(route.userId)) continue;

    const candidates = profiles
      .filter((profile) => profile.userId !== route.userId && allow.get(profile.userId) !== false && !disabled.has(profile.userId))
      .filter((profile) => profile.latitude != null && profile.longitude != null && profile.updatedAt != null)
      .map((profile) => {
        const age = Date.now() - new Date(profile.updatedAt!).getTime();
        if (age < 0 || age > PROFILE_MAX_AGE_MS) return null;
        const distanceKm = Math.min(...targets.map((target) => haversineKm(target.latitude, target.longitude, profile.latitude!, profile.longitude!)));
        return { profile, distanceKm };
      })
      .filter((candidate): candidate is { profile: typeof profiles[number]; distanceKm: number } => candidate !== null)
      .filter((candidate) => candidate.distanceKm <= (dynamic ? DYNAMIC_RADIUS_KM : STATIC_RADIUS_KM))
      .filter((candidate) => !blockedSet.has(route.userId + ":" + candidate.profile.userId))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, MAX_INVITES_PER_ROUTE);

    for (const candidate of candidates) {
      const score = Math.max(0.25, Math.min(1, 1 - candidate.distanceKm / (dynamic ? DYNAMIC_RADIUS_KM : STATIC_RADIUS_KM)));
      const inserted = await db.insert(plannedRouteInvites).values({
        routeId: route.id,
        ownerId: route.userId,
        suggestedUserId: candidate.profile.userId,
        score: Math.round(score * 10000) / 10000,
        reasons: {
          matchType: dynamic ? "dynamic_live" : "static_start",
          distanceKm: Math.round(candidate.distanceKm * 10) / 10,
          liveEvent: live?.event ?? null,
          livePositionSource: live?.positionSource ?? null,
          livePositionKnown: dynamic,
        },
        priority: dynamic ? "high" : "normal",
        status: "suggested",
      }).onConflictDoNothing().returning({ id: plannedRouteInvites.id });
      if (inserted.length === 0) continue;
      invitesCreated++;
      if (dynamic) dynamicMatches++;
      else staticMatches++;
      void sendPlannedRouteInvitePushNotifications([candidate.profile.userId], { routeId: route.id }).catch(() => {});
    }
    routesProcessed++;
  }

  return { routesProcessed, invitesCreated, dynamicMatches, staticMatches };
}
