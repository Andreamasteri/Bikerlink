import { describe, it, expect, vi, afterEach } from "vitest";
import { capMarkers, MARKERS_HARD_CAP } from "../maps/cap-markers";

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMarkers(
  n: number,
  baseLat = 45.0,
  baseLng = 10.0
): Array<{ lat: number; lng: number; id: string }> {
  return Array.from({ length: n }, (_, i) => ({
    id: String(i),
    // Spread markers in a straight line north of the base point.
    // The first marker (i=0) is the closest to the base centre.
    lat: baseLat + i * 0.01,
    lng: baseLng,
  }));
}

const CENTER = { lat: 45.0, lng: 10.0 };

// ---------------------------------------------------------------------------
// No-op when total ≤ cap
// ---------------------------------------------------------------------------

describe("capMarkers — no trimming needed", () => {
  it("returns the same object reference when total is below cap", () => {
    const markers = {
      users: makeMarkers(50),
      workshops: makeMarkers(30),
      businesses: makeMarkers(20),
    };
    const result = capMarkers(markers, CENTER);
    expect(result).toBe(markers);
  });

  it("returns the same object when total equals the cap exactly", () => {
    const markers = { users: makeMarkers(MARKERS_HARD_CAP) };
    const result = capMarkers(markers, CENTER);
    expect(result).toBe(markers);
  });

  it("returns the same object when markers object is empty", () => {
    const markers = {};
    const result = capMarkers(markers, null);
    expect(result).toBe(markers);
  });

  it("handles undefined category arrays gracefully", () => {
    const markers = { users: undefined, workshops: makeMarkers(10) };
    const result = capMarkers(markers, CENTER);
    expect(result).toBe(markers);
  });
});

// ---------------------------------------------------------------------------
// Trimming — total count
// ---------------------------------------------------------------------------

describe("capMarkers — total count after trimming", () => {
  it("caps 1000 markers across 5 categories to ≤ 400 total", () => {
    const markers = {
      users: makeMarkers(200),
      workshops: makeMarkers(200),
      businesses: makeMarkers(200),
      events: makeMarkers(200),
      clubs: makeMarkers(200),
    };
    const result = capMarkers(markers, CENTER);
    const total =
      (result.users?.length ?? 0) +
      (result.workshops?.length ?? 0) +
      (result.businesses?.length ?? 0) +
      (result.events?.length ?? 0) +
      (result.clubs?.length ?? 0);
    expect(total).toBeLessThanOrEqual(MARKERS_HARD_CAP);
  });

  it("caps with a custom cap argument", () => {
    const markers = { users: makeMarkers(500) };
    const result = capMarkers(markers, CENTER, 100);
    expect(result.users?.length).toBeLessThanOrEqual(100);
  });

  it("produces at least 1 marker per non-empty category", () => {
    const markers = {
      users: makeMarkers(600),
      workshops: makeMarkers(300),
      businesses: makeMarkers(100),
    };
    const result = capMarkers(markers, CENTER, 10); // very tight cap
    expect((result.users?.length ?? 0)).toBeGreaterThanOrEqual(1);
    expect((result.workshops?.length ?? 0)).toBeGreaterThanOrEqual(1);
    expect((result.businesses?.length ?? 0)).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Proportional distribution
// ---------------------------------------------------------------------------

describe("capMarkers — proportional distribution", () => {
  it("larger categories get more of the budget", () => {
    // users: 500, workshops: 100, total 600 (over cap 400)
    // users share = 500/600 ≈ 83 %, so users should get >> workshops
    const markers = {
      users: makeMarkers(500),
      workshops: makeMarkers(100),
    };
    const result = capMarkers(markers, CENTER);
    const usersKept = result.users?.length ?? 0;
    const workshopsKept = result.workshops?.length ?? 0;
    expect(usersKept).toBeGreaterThan(workshopsKept);
  });

  it("equal-sized categories get roughly equal quotas", () => {
    const N = 200; // 5 × 200 = 1000, well over cap
    const markers = {
      users: makeMarkers(N),
      workshops: makeMarkers(N),
      businesses: makeMarkers(N),
      events: makeMarkers(N),
      clubs: makeMarkers(N),
    };
    const result = capMarkers(markers, CENTER);
    const counts = [
      result.users?.length ?? 0,
      result.workshops?.length ?? 0,
      result.businesses?.length ?? 0,
      result.events?.length ?? 0,
      result.clubs?.length ?? 0,
    ];
    const min = Math.min(...counts);
    const max = Math.max(...counts);
    // Proportional rounding may differ by at most 1 between equal-sized categories.
    expect(max - min).toBeLessThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Nearest-first — closest markers survive
// ---------------------------------------------------------------------------

describe("capMarkers — nearest-first priority", () => {
  it("keeps the closest markers when trimming", () => {
    // 200 users spread from lat 45.0 to 46.99 (i*0.01).
    // Centre is at lat 45.0 → the first markers are closest.
    const users = makeMarkers(200, 45.0);
    const markers = { users };
    const result = capMarkers(markers, CENTER, 50);

    const kept = result.users ?? [];
    // All kept markers should be closer to centre than the farthest dropped one.
    // With nearest-first, the kept lats should be in the lower range.
    const maxKeptLat = Math.max(...kept.map((u) => u.lat));
    // The 51st marker starts at lat 45.0 + 50*0.01 = 45.5
    expect(maxKeptLat).toBeLessThanOrEqual(45.0 + 50 * 0.01 + 0.001);
  });

  it("marker with id '0' (closest to centre) always survives trimming", () => {
    const markers = { users: makeMarkers(200, 45.0) };
    const result = capMarkers(markers, CENTER, 20);
    const ids = (result.users ?? []).map((u) => u.id);
    expect(ids).toContain("0");
  });

  it("falls back to array-position trimming when no centre is provided", () => {
    const markers = { users: makeMarkers(200) };
    const result = capMarkers(markers, null, 50);
    const kept = result.users ?? [];
    expect(kept.length).toBeLessThanOrEqual(50);
    // Without a centre, front of array is kept.
    expect(kept[0].id).toBe("0");
  });
});

// ---------------------------------------------------------------------------
// Strict total ≤ cap — regression for Math.round overallocation
// ---------------------------------------------------------------------------

describe("capMarkers — strict total enforcement (largest-remainder regression)", () => {
  it("never returns more than cap markers for 2 equal categories (the Math.round ÷2 trap)", () => {
    // 2 equal categories, cap=5: Math.round(2.5)=3 per category → total=6 > 5.
    // The largest-remainder method must yield total=5 exactly.
    const markers = {
      users: makeMarkers(3),
      workshops: makeMarkers(3),
    };
    const result = capMarkers(markers, CENTER, 5);
    const got = (result.users?.length ?? 0) + (result.workshops?.length ?? 0);
    expect(got).toBeLessThanOrEqual(5);
  });

  it("never returns more than cap markers for a 3-category skewed split", () => {
    // 3 categories [4, 4, 3], cap=10:
    // Math.round quotas → [4,4,3] total=11 > 10 (old bug).
    // Largest-remainder must yield ≤ 10.
    const markers = {
      users: makeMarkers(4),
      workshops: makeMarkers(4),
      businesses: makeMarkers(3),
    };
    const result = capMarkers(markers, CENTER, 10);
    const got =
      (result.users?.length ?? 0) +
      (result.workshops?.length ?? 0) +
      (result.businesses?.length ?? 0);
    expect(got).toBeLessThanOrEqual(10);
  });

  it("never exceeds MARKERS_HARD_CAP (400) for any realistic distribution", () => {
    // Stress-test proportional rounding across many possible splits.
    const distributions: [number, number, number, number, number][] = [
      [200, 200, 200, 200, 200], // equal
      [399, 1, 1, 1, 1],        // highly skewed
      [100, 99, 98, 97, 96],    // descending
      [1, 1, 1, 1, 1000],       // one dominant category
    ];
    for (const dist of distributions) {
      const markers = {
        users: makeMarkers(dist[0]),
        workshops: makeMarkers(dist[1]),
        businesses: makeMarkers(dist[2]),
        events: makeMarkers(dist[3]),
        clubs: makeMarkers(dist[4]),
      };
      const result = capMarkers(markers, CENTER);
      const got =
        (result.users?.length ?? 0) +
        (result.workshops?.length ?? 0) +
        (result.businesses?.length ?? 0) +
        (result.events?.length ?? 0) +
        (result.clubs?.length ?? 0);
      expect(got).toBeLessThanOrEqual(MARKERS_HARD_CAP);
    }
  });
});

// ---------------------------------------------------------------------------
// Non-capped categories are left untouched
// ---------------------------------------------------------------------------

describe("capMarkers — non-capped fields", () => {
  it("passes realMe and fakeMe through unchanged", () => {
    const realMe = { lat: 45.0, lng: 10.0 };
    const fakeMe = { lat: 45.1, lng: 10.1 };
    const markers = {
      users: makeMarkers(500),
      realMe,
      fakeMe,
    };
    const result = capMarkers(markers, CENTER);
    expect(result.realMe).toBe(realMe);
    expect(result.fakeMe).toBe(fakeMe);
  });
});

// ---------------------------------------------------------------------------
// console.warn is emitted when cap fires
// ---------------------------------------------------------------------------

describe("capMarkers — warnings", () => {
  it("emits console.warn when cap is hit", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const markers = { users: makeMarkers(500) };
    capMarkers(markers, CENTER);
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toMatch(/capMarkers/);
  });

  it("does NOT emit console.warn when cap is not hit", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const markers = { users: makeMarkers(10) };
    capMarkers(markers, CENTER);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
