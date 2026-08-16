/**
 * Canonical tab-domain registry.
 *
 * The Expo Router layout still owns the static screen options because changing
 * them after mount reopens the historical React Navigation loop. Consumers
 * such as the custom taskbar use this registry for grouping instead of keeping
 * a second, silently divergent list of route names.
 */
export const TAB_ROUTE_REGISTRY = [
  { name: "index", domain: "map", surface: "main" },
  { name: "proposals", domain: "social-proposals", surface: "main" },
  { name: "ready", domain: "status", surface: "main" },
  { name: "motoclub", domain: "community", surface: "community" },
  { name: "eventi", domain: "community", surface: "community" },
  { name: "match", domain: "community", surface: "community" },
  { name: "music", domain: "community", surface: "community" },
  // Chat remains a direct tab in the existing taskbar contract; grouping it
  // would silently reduce the number of primary entries.
  { name: "chat", domain: "community", surface: "direct" },
  { name: "contest", domain: "community", surface: "community" },
  { name: "arcade", domain: "community", surface: "community" },
  { name: "bowie", domain: "community-ai", surface: "community" },
  { name: "ride", domain: "privacy-gps", surface: "internal" },
  { name: "giri", domain: "ideal-laps", surface: "internal" },
  { name: "tracking", domain: "manual-tracking", surface: "internal" },
  { name: "garage", domain: "garage", surface: "internal" },
  { name: "profile", domain: "profile", surface: "internal" },
] as const;

export const COMMUNITY_ROUTE_NAMES: ReadonlySet<string> = new Set(
  TAB_ROUTE_REGISTRY.filter((entry) => entry.surface === "community").map((entry) => entry.name),
);

export function isCommunityRouteName(name: string): boolean {
  return COMMUNITY_ROUTE_NAMES.has(name);
}
