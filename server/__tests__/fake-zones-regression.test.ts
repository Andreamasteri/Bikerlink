/**
 * Regression tests — applyFakeZones (unit)
 *
 * Covers the pure applyFakeZones function for all three zone types:
 *   - fakeWhateverRadius (Task #4367)
 *   - fakeHomeRadius
 *   - fakeWorkRadius
 *   - priority: home > work > whatever
 *
 * HTTP-level regression tests (BUG 1/2/3) are in fake-zones-bugs.test.ts
 */

import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks — hoisted by vitest
// ---------------------------------------------------------------------------

vi.mock("../storage", () => ({
  storage: {
    getUser: vi.fn(),
    updateUser: vi.fn().mockResolvedValue(undefined),
    getUserByNickname: vi.fn().mockResolvedValue(null),
    getUserProfile: vi.fn(),
    updateUserProfile: vi.fn().mockResolvedValue({}),
    createUserProfile: vi.fn().mockResolvedValue({}),
    getUserPhotos: vi.fn().mockResolvedValue([]),
    getUserMotorcycles: vi.fn().mockResolvedValue([]),
    getUserMotorcyclesBatch: vi.fn().mockResolvedValue([]),
    getBlockedUserIds: vi.fn().mockResolvedValue([]),
    getAppSetting: vi.fn().mockResolvedValue(null),
    getOnlineUsersList: vi.fn().mockResolvedValue([]),
    getAvailableUsersList: vi.fn().mockResolvedValue([]),
    getAvailableBikersList: vi.fn().mockResolvedValue([]),
    getAvailableZavorrinaList: vi.fn().mockResolvedValue([]),
    getNearbyUsers: vi.fn().mockResolvedValue([]),
    searchUsers: vi.fn().mockResolvedValue([]),
    getAllUsers: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../online-tracker", () => ({
  onlineTracker: {
    getOnlineUserIds: vi.fn().mockReturnValue([]),
    getAvailableBikerIds: vi.fn().mockReturnValue([]),
    getAvailableZavorrinaIds: vi.fn().mockReturnValue([]),
    isOnline: vi.fn().mockReturnValue(false),
    countAvailableBikers: vi.fn().mockReturnValue(0),
    countAvailableZavorrine: vi.fn().mockReturnValue(0),
    setOfflineCallback: vi.fn(),
    setAvailability: vi.fn(),
    setGhostMode: vi.fn(),
  },
}));

// Uses the shared db-mock helper so future DB-shape changes need one edit in the
// helper, not here. Async factory + dynamic import is the hoisting-safe usage.
vi.mock("../db", async () => {
  const { createDbMock } = await import("./helpers/db-mock");
  return createDbMock();
});

vi.mock("../objectStorage", () => ({
  uploadBuffer: vi.fn(),
  downloadBuffer: vi.fn(),
  deleteObject: vi.fn(),
}));

vi.mock("../lib/abuse-rate-limit", () => ({
  reportRateLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  getTrustedClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("../routes/motoclubs", () => ({
  createRegionalClubInvite: vi.fn(),
  seedMotoclubs: vi.fn(),
}));

vi.mock("../routes/motoclubs/utils", () => ({
  createRegionalClubInvite: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../matching-engine", () => ({
  triggerProposalProfileMatchingForZavorrina: vi.fn(),
}));

vi.mock("../embeddings/bio-queue", () => ({
  enqueueBioEmbedding: vi.fn(),
}));

vi.mock("../embeddings", () => ({
  deleteEmbedding: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { applyFakeZones } from "../routes/users";

// ---------------------------------------------------------------------------
// Task #4367 — applyFakeZones applica correttamente fakeWhateverRadius
// ---------------------------------------------------------------------------

describe("Task #4367 — applyFakeZones rispetta fakeWhateverRadius", () => {
  const WHATEVER_LAT = 41.9;
  const WHATEVER_LNG = 12.5;
  const FAKE_WHATEVER_LAT = 40.85;
  const FAKE_WHATEVER_LNG = 14.27;

  function makeWhateverProfile(overrides: Record<string, unknown> = {}) {
    return {
      fakeHomeEnabled: false,
      fakeWorkEnabled: false,
      fakeWhateverEnabled: true,
      whateverLatitude: WHATEVER_LAT,
      whateverLongitude: WHATEVER_LNG,
      fakeWhateverLatitude: FAKE_WHATEVER_LAT,
      fakeWhateverLongitude: FAKE_WHATEVER_LNG,
      fakeWhateverRadius: 2,
      ...overrides,
    };
  }

  it("sostituisce le coordinate quando l'utente è entro fakeWhateverRadius", () => {
    const profile = makeWhateverProfile();
    const res = applyFakeZones(WHATEVER_LAT + 0.007, WHATEVER_LNG, profile);

    expect(res.applied).toBe(true);
    expect(res.lat).toBe(FAKE_WHATEVER_LAT);
    expect(res.lng).toBe(FAKE_WHATEVER_LNG);
  });

  it("NON sostituisce le coordinate quando l'utente è oltre fakeWhateverRadius", () => {
    const profile = makeWhateverProfile();
    const inputLat = WHATEVER_LAT + 0.05;
    const res = applyFakeZones(inputLat, WHATEVER_LNG, profile);

    expect(res.applied).toBe(false);
    expect(res.lat).toBe(inputLat);
    expect(res.lng).toBe(WHATEVER_LNG);
  });

  it("rispetta un fakeWhateverRadius personalizzato più ampio", () => {
    const profile = makeWhateverProfile({ fakeWhateverRadius: 10 });
    const res = applyFakeZones(WHATEVER_LAT + 0.05, WHATEVER_LNG, profile);

    expect(res.applied).toBe(true);
    expect(res.lat).toBe(FAKE_WHATEVER_LAT);
    expect(res.lng).toBe(FAKE_WHATEVER_LNG);
  });

  it("usa il fallback di 2 km quando fakeWhateverRadius è null", () => {
    const profile = makeWhateverProfile({ fakeWhateverRadius: null });
    const res = applyFakeZones(WHATEVER_LAT + 0.007, WHATEVER_LNG, profile);

    expect(res.applied).toBe(true);
    expect(res.lat).toBe(FAKE_WHATEVER_LAT);
    expect(res.lng).toBe(FAKE_WHATEVER_LNG);
  });
});

// ---------------------------------------------------------------------------
// applyFakeZones — zona CASA (fakeHomeRadius)
// ---------------------------------------------------------------------------

describe("applyFakeZones — zona casa (fakeHomeRadius)", () => {
  const HOME_LAT = 45.464;
  const HOME_LNG = 9.19;
  const FAKE_HOME_SNAP_LAT = 44.4;
  const FAKE_HOME_SNAP_LNG = 8.9;

  function makeHomeProfile(overrides: Record<string, unknown> = {}) {
    return {
      fakeHomeEnabled: true,
      homeLatitude: HOME_LAT,
      homeLongitude: HOME_LNG,
      fakeHomeLatitude: FAKE_HOME_SNAP_LAT,
      fakeHomeLongitude: FAKE_HOME_SNAP_LNG,
      fakeHomeRadius: 2,
      fakeWorkEnabled: false,
      fakeWhateverEnabled: false,
      ...overrides,
    };
  }

  it("sostituisce le coordinate quando l'utente è entro fakeHomeRadius", () => {
    const profile = makeHomeProfile();
    const res = applyFakeZones(HOME_LAT + 0.007, HOME_LNG, profile);

    expect(res.applied).toBe(true);
    expect(res.lat).toBe(FAKE_HOME_SNAP_LAT);
    expect(res.lng).toBe(FAKE_HOME_SNAP_LNG);
  });

  it("NON sostituisce le coordinate quando l'utente è oltre fakeHomeRadius", () => {
    const profile = makeHomeProfile();
    const inputLat = HOME_LAT + 0.05;
    const res = applyFakeZones(inputLat, HOME_LNG, profile);

    expect(res.applied).toBe(false);
    expect(res.lat).toBe(inputLat);
    expect(res.lng).toBe(HOME_LNG);
  });

  it("rispetta un fakeHomeRadius personalizzato più ampio", () => {
    const profile = makeHomeProfile({ fakeHomeRadius: 10 });
    const res = applyFakeZones(HOME_LAT + 0.05, HOME_LNG, profile);

    expect(res.applied).toBe(true);
    expect(res.lat).toBe(FAKE_HOME_SNAP_LAT);
    expect(res.lng).toBe(FAKE_HOME_SNAP_LNG);
  });

  it("usa il fallback di 2 km quando fakeHomeRadius è null", () => {
    const profile = makeHomeProfile({ fakeHomeRadius: null });
    const res = applyFakeZones(HOME_LAT + 0.007, HOME_LNG, profile);

    expect(res.applied).toBe(true);
    expect(res.lat).toBe(FAKE_HOME_SNAP_LAT);
    expect(res.lng).toBe(FAKE_HOME_SNAP_LNG);
  });

  it("NON applica la zona casa quando fakeHomeEnabled è false", () => {
    const profile = makeHomeProfile({ fakeHomeEnabled: false });
    const res = applyFakeZones(HOME_LAT + 0.007, HOME_LNG, profile);

    expect(res.applied).toBe(false);
    expect(res.lat).toBe(HOME_LAT + 0.007);
  });

  it("NON applica la zona casa quando homeLatitude è null", () => {
    const profile = makeHomeProfile({ homeLatitude: null });
    const res = applyFakeZones(HOME_LAT + 0.007, HOME_LNG, profile);

    expect(res.applied).toBe(false);
  });

  it("NON applica la zona casa quando fakeHomeLatitude è null", () => {
    const profile = makeHomeProfile({ fakeHomeLatitude: null });
    const res = applyFakeZones(HOME_LAT + 0.007, HOME_LNG, profile);

    expect(res.applied).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyFakeZones — zona LAVORO (fakeWorkRadius)
// ---------------------------------------------------------------------------

describe("applyFakeZones — zona lavoro (fakeWorkRadius)", () => {
  const WORK_LAT = 45.465;
  const WORK_LNG = 9.191;
  const FAKE_WORK_LAT = 44.5;
  const FAKE_WORK_LNG = 8.95;

  function makeWorkProfile(overrides: Record<string, unknown> = {}) {
    return {
      fakeHomeEnabled: false,
      fakeWorkEnabled: true,
      workLatitude: WORK_LAT,
      workLongitude: WORK_LNG,
      fakeWorkLatitude: FAKE_WORK_LAT,
      fakeWorkLongitude: FAKE_WORK_LNG,
      fakeWorkRadius: 2,
      fakeWhateverEnabled: false,
      ...overrides,
    };
  }

  it("sostituisce le coordinate quando l'utente è entro fakeWorkRadius", () => {
    const profile = makeWorkProfile();
    const res = applyFakeZones(WORK_LAT + 0.007, WORK_LNG, profile);

    expect(res.applied).toBe(true);
    expect(res.lat).toBe(FAKE_WORK_LAT);
    expect(res.lng).toBe(FAKE_WORK_LNG);
  });

  it("NON sostituisce le coordinate quando l'utente è oltre fakeWorkRadius", () => {
    const profile = makeWorkProfile();
    const inputLat = WORK_LAT + 0.05;
    const res = applyFakeZones(inputLat, WORK_LNG, profile);

    expect(res.applied).toBe(false);
    expect(res.lat).toBe(inputLat);
    expect(res.lng).toBe(WORK_LNG);
  });

  it("rispetta un fakeWorkRadius personalizzato più ampio", () => {
    const profile = makeWorkProfile({ fakeWorkRadius: 10 });
    const res = applyFakeZones(WORK_LAT + 0.05, WORK_LNG, profile);

    expect(res.applied).toBe(true);
    expect(res.lat).toBe(FAKE_WORK_LAT);
    expect(res.lng).toBe(FAKE_WORK_LNG);
  });

  it("usa il fallback di 2 km quando fakeWorkRadius è null", () => {
    const profile = makeWorkProfile({ fakeWorkRadius: null });
    const res = applyFakeZones(WORK_LAT + 0.007, WORK_LNG, profile);

    expect(res.applied).toBe(true);
    expect(res.lat).toBe(FAKE_WORK_LAT);
    expect(res.lng).toBe(FAKE_WORK_LNG);
  });

  it("NON applica la zona lavoro quando fakeWorkEnabled è false", () => {
    const profile = makeWorkProfile({ fakeWorkEnabled: false });
    const res = applyFakeZones(WORK_LAT + 0.007, WORK_LNG, profile);

    expect(res.applied).toBe(false);
    expect(res.lat).toBe(WORK_LAT + 0.007);
  });

  it("NON applica la zona lavoro quando workLatitude è null", () => {
    const profile = makeWorkProfile({ workLatitude: null });
    const res = applyFakeZones(WORK_LAT + 0.007, WORK_LNG, profile);

    expect(res.applied).toBe(false);
  });

  it("NON applica la zona lavoro quando fakeWorkLatitude è null", () => {
    const profile = makeWorkProfile({ fakeWorkLatitude: null });
    const res = applyFakeZones(WORK_LAT + 0.007, WORK_LNG, profile);

    expect(res.applied).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyFakeZones — priorità tra zone (casa > lavoro > qualsiasi)
// ---------------------------------------------------------------------------

describe("applyFakeZones — priorità casa > lavoro > qualsiasi", () => {
  const CENTER_LAT = 45.464;
  const CENTER_LNG = 9.19;

  it("applica la zona CASA anche se fakeWork è attivo e l'utente è nel raggio di entrambe", () => {
    const profile = {
      fakeHomeEnabled: true,
      homeLatitude: CENTER_LAT,
      homeLongitude: CENTER_LNG,
      fakeHomeLatitude: 44.1,
      fakeHomeLongitude: 8.8,
      fakeHomeRadius: 2,
      fakeWorkEnabled: true,
      workLatitude: CENTER_LAT,
      workLongitude: CENTER_LNG,
      fakeWorkLatitude: 44.2,
      fakeWorkLongitude: 8.9,
      fakeWorkRadius: 2,
      fakeWhateverEnabled: false,
    };

    const res = applyFakeZones(CENTER_LAT + 0.001, CENTER_LNG, profile);

    expect(res.applied).toBe(true);
    expect(res.lat).toBe(44.1);
    expect(res.lng).toBe(8.8);
  });

  it("applica la zona LAVORO quando casa non scatta ma lavoro sì", () => {
    const profile = {
      fakeHomeEnabled: true,
      homeLatitude: CENTER_LAT + 1.0,
      homeLongitude: CENTER_LNG,
      fakeHomeLatitude: 44.1,
      fakeHomeLongitude: 8.8,
      fakeHomeRadius: 2,
      fakeWorkEnabled: true,
      workLatitude: CENTER_LAT,
      workLongitude: CENTER_LNG,
      fakeWorkLatitude: 44.2,
      fakeWorkLongitude: 8.9,
      fakeWorkRadius: 2,
      fakeWhateverEnabled: false,
    };

    const res = applyFakeZones(CENTER_LAT + 0.001, CENTER_LNG, profile);

    expect(res.applied).toBe(true);
    expect(res.lat).toBe(44.2);
    expect(res.lng).toBe(8.9);
  });
});
