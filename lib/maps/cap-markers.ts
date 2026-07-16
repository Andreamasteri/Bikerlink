/**
 * capMarkers — hard-cap the total number of markers injected into the
 * Leaflet WebView bridge to prevent Android OOM (HashMap.resize crash).
 *
 * Root cause: serialising a large markers object into a Java HashMap via the
 * React Native bridge can exhaust the 256 MB Android heap on densely populated
 * sessions.  Capping at 400 total entries keeps the bridge payload well below
 * the threshold observed in the Sentry production crash.
 *
 * Quota algorithm — "largest remainder method" (Hamilton's method):
 *  1. Reserve 1 slot per non-empty category (minimum guarantee).
 *  2. Distribute the remaining budget (cap − #nonEmpty) proportionally among
 *     non-empty categories using fractional quotas: floor first, then assign
 *     leftover slots one-by-one to categories with the largest fractional
 *     remainders.  This guarantees sum(quotas) == cap exactly.
 *  3. Trim each category to its quota, sorting nearest-first if a viewport
 *     centre is available (closest markers survive).
 *
 * Strict invariant: the returned markers object always has
 *   sum(category.length for category in CAPPED_KEYS) ≤ cap.
 */

export const MARKERS_HARD_CAP = 400;

type LatLng = { lat: number; lng: number };

function _distSq(a: LatLng, b: LatLng): number {
  const dlat = a.lat - b.lat;
  const dlng = a.lng - b.lng;
  return dlat * dlat + dlng * dlng;
}

/** Marker categories that contribute to the bridge payload (all carry lat/lng). */
const CAPPED_KEYS = [
  "users",
  "workshops",
  "businesses",
  "events",
  "clubs",
  "easterEggs",
  "sos",
] as const;

type CappedKey = (typeof CAPPED_KEYS)[number];

type MarkerArray = Array<LatLng & Record<string, unknown>>;

/** Shape accepted by capMarkers — mirrors the `markers` field in buildMapMarkersState. */
export interface MarkersPayload {
  users?: MarkerArray;
  workshops?: MarkerArray;
  businesses?: MarkerArray;
  events?: MarkerArray;
  clubs?: MarkerArray;
  easterEggs?: MarkerArray;
  sos?: MarkerArray;
  [key: string]: unknown;
}

/**
 * Cap the total number of bridge markers to `cap` (default 400).
 *
 * @param markers   The assembled markers object from buildMapMarkersState.
 * @param center    Viewport centre for distance-based priority (nearest kept).
 *                  Pass null to trim by array position instead.
 * @param cap       Hard upper bound on total markers. Default 400.
 * @returns A new markers object (or the same object if no trimming needed).
 *          The returned total is guaranteed ≤ cap.
 */
export function capMarkers(
  markers: MarkersPayload,
  center: LatLng | null,
  cap: number = MARKERS_HARD_CAP
): MarkersPayload {
  // --- Count totals --------------------------------------------------------
  const counts = {} as Record<CappedKey, number>;
  let total = 0;
  for (const k of CAPPED_KEYS) {
    const n = markers[k]?.length ?? 0;
    counts[k] = n;
    total += n;
  }

  if (total <= cap) return markers; // fast path — nothing to trim

  // eslint-disable-next-line no-console
  console.warn(
    `[capMarkers] Bridge marker cap hit: ${total} markers → trimming to ${cap} total`
  );

  const result: MarkersPayload = { ...markers };

  // --- Identify non-empty categories ---------------------------------------
  const nonEmptyKeys = CAPPED_KEYS.filter((k) => counts[k] > 0);
  const n = nonEmptyKeys.length;

  if (n === 0) return markers;

  // Extreme edge: more categories than cap slots — give 1 to each up to cap.
  if (n >= cap) {
    for (const k of CAPPED_KEYS) {
      const arr = markers[k];
      if (!arr || arr.length === 0) continue;
      if (nonEmptyKeys.indexOf(k) >= cap) {
        result[k] = [];
        continue;
      }
      result[k] = center !== null
        ? [...arr].sort((a, b) => _distSq(a, center) - _distSq(b, center)).slice(0, 1)
        : arr.slice(0, 1);
    }
    return result;
  }

  // --- Largest remainder method (Hamilton's) --------------------------------
  // Phase 1: reserve 1 slot per non-empty category.
  // Phase 2: distribute the remaining budget proportionally.
  const remaining = cap - n; // slots left after the per-category minimum

  // Compute exact proportional shares of the remaining budget.
  const extras: Array<{ key: CappedKey; exact: number; floored: number }> =
    nonEmptyKeys.map((k) => {
      const exact = (counts[k] / total) * remaining;
      return { key: k, exact, floored: Math.floor(exact) };
    });

  const extraSum = extras.reduce((s, e) => s + e.floored, 0);
  const leftover = remaining - extraSum; // unallocated slots due to flooring

  // Award leftover slots to categories with the largest fractional remainders.
  const sortedByFraction = [...extras].sort(
    (a, b) => (b.exact - b.floored) - (a.exact - a.floored)
  );
  for (let i = 0; i < leftover; i++) {
    sortedByFraction[i].floored += 1;
  }

  // Build quota map: 1 (minimum) + proportional extra.
  const quotas = {} as Record<CappedKey, number>;
  for (const e of extras) {
    quotas[e.key] = 1 + e.floored;
  }
  for (const k of CAPPED_KEYS) {
    if (!(k in quotas)) quotas[k] = 0;
  }

  // --- Trim each category to its quota ------------------------------------
  for (const k of CAPPED_KEYS) {
    const arr = markers[k];
    if (!arr || arr.length === 0) continue;

    const quota = quotas[k];
    if (quota <= 0) {
      result[k] = [];
      continue;
    }
    if (arr.length <= quota) continue; // already within quota — no trim needed

    // Pin any marker with isCurrentUser === true so it always survives,
    // regardless of its distance from the viewport centre.
    const pinnedIdx = arr.findIndex(
      (m) => (m as Record<string, unknown>).isCurrentUser === true
    );

    if (center !== null) {
      if (pinnedIdx !== -1) {
        const pinned = arr[pinnedIdx];
        const rest = arr.filter((_, i) => i !== pinnedIdx);
        const sorted = [...rest].sort(
          (a, b) => _distSq(a, center) - _distSq(b, center)
        );
        // quota - 1 nearest from the rest, then prepend the pinned entry.
        result[k] = [pinned, ...sorted.slice(0, quota - 1)];
      } else {
        const sorted = [...arr].sort(
          (a, b) => _distSq(a, center) - _distSq(b, center)
        );
        result[k] = sorted.slice(0, quota);
      }
    } else {
      if (pinnedIdx !== -1) {
        const pinned = arr[pinnedIdx];
        const rest = arr.filter((_, i) => i !== pinnedIdx);
        result[k] = [pinned, ...rest.slice(0, quota - 1)];
      } else {
        result[k] = arr.slice(0, quota);
      }
    }
  }

  return result;
}
