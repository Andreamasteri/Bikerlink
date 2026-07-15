import { describe, it, expect } from "vitest";
import { revealOnFirstCoordinate } from "../lib/map-visibility";

const COORDS = { newLat: 41.89, newLng: 12.48 } as const;

describe("revealOnFirstCoordinate (Task #66 + Task #103)", () => {
  it("reveals a never-positioned profile on its first coordinate", () => {
    const out = revealOnFirstCoordinate(
      { latitude: COORDS.newLat, longitude: COORDS.newLng },
      { coordinatesUpdatedAt: null },
      COORDS.newLat,
      COORDS.newLng,
    );
    expect(out.hideFromMap).toBe(false);
  });

  it("reveals when no existing profile row is present yet", () => {
    const out = revealOnFirstCoordinate({ latitude: COORDS.newLat }, null, COORDS.newLat, COORDS.newLng);
    expect(out.hideFromMap).toBe(false);
  });

  it("does not touch visibility once the profile has been positioned before", () => {
    const out = revealOnFirstCoordinate(
      { latitude: COORDS.newLat },
      { coordinatesUpdatedAt: new Date() },
      COORDS.newLat,
      COORDS.newLng,
    );
    expect(out).not.toHaveProperty("hideFromMap");
  });

  it("does not reveal without real new coordinates", () => {
    const out = revealOnFirstCoordinate(
      { isAvailable: true },
      { coordinatesUpdatedAt: null },
      null,
      null,
    );
    expect(out).not.toHaveProperty("hideFromMap");
  });

  // Task #103 — the privacy-intent regression this fix closes.
  it("preserves an explicit 'hide me' choice made before the first coordinate", () => {
    const out = revealOnFirstCoordinate(
      { latitude: COORDS.newLat, longitude: COORDS.newLng },
      { coordinatesUpdatedAt: null, hideFromMapExplicit: true },
      COORDS.newLat,
      COORDS.newLng,
    );
    // The rider deliberately hid themselves — the first GPS fix must not un-hide them.
    expect(out).not.toHaveProperty("hideFromMap");
  });

  it("still reveals when the explicit marker is false (signup default hide)", () => {
    const out = revealOnFirstCoordinate(
      { latitude: COORDS.newLat, longitude: COORDS.newLng },
      { coordinatesUpdatedAt: null, hideFromMapExplicit: false },
      COORDS.newLat,
      COORDS.newLng,
    );
    expect(out.hideFromMap).toBe(false);
  });
});
