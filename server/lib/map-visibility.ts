/**
 * Task #66 — map visibility invariant helper.
 *
 * A profile must never be advertised as visible on the map (hide_from_map=false)
 * while it has no coordinates, or the rider believes they are visible yet never
 * appears (the map/discovery queries require non-null lat/lng). New profiles are
 * created hidden (see register.ts) so they aren't falsely advertised before they
 * have a position.
 *
 * This helper restores the "visible by default" product behaviour the first time
 * a real coordinate is stored — and only then: it fires solely when the profile
 * has never been positioned (coordinatesUpdatedAt == null), so it never overrides
 * a visibility choice a positioned rider makes later.
 *
 * Lives in its own module (not routes/users.ts) so the auth login handler can use
 * it without importing the entire users router tree.
 */
export function revealOnFirstCoordinate<T extends Record<string, unknown>>(
  updateData: T,
  existingProfile: { coordinatesUpdatedAt?: Date | null } | null | undefined,
  newLat: number | null | undefined,
  newLng: number | null | undefined,
): T {
  const hasNewCoords = typeof newLat === "number" && typeof newLng === "number";
  const neverPositioned = !existingProfile || existingProfile.coordinatesUpdatedAt == null;
  if (hasNewCoords && neverPositioned) {
    return { ...updateData, hideFromMap: false };
  }
  return updateData;
}
