/**
 * Regression tests — Fake Position Pipeline
 *
 * Covers three specific regressions fixed in this task:
 *
 *  1. PUT /me: applyFakeZones must run before persisting lat/lng (BUG 1)
 *  2. captureFirstAvailabilityLocation must receive fLat/fLng, not raw coords (BUG 2)
 *  3. POST /app-close: must honour global offline_position_randomize_default setting (BUG 3)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";

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

vi.mock("../db", () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() },
  pool: { query: vi.fn(), connect: vi.fn() },
}));

vi.mock("../objectStorage", () => ({
  uploadBuffer: vi.fn(),
  downloadBuffer: vi.fn(),
  deleteObject: vi.fn(),
}));

vi.mock("../lib/abuse-rate-limit", () => ({
  reportRateLimiter: (_req: Request, _res: Response, next: NextFunction) => next(),
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

import { storage } from "../storage";
import usersRouter, { applyFakeZones } from "../routes/users";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID = "regression-user-42";

const REAL_LAT = 45.0;
const REAL_LNG = 9.0;
const FAKE_HOME_LAT = 46.0;
const FAKE_HOME_LNG = 10.0;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildApp(): express.Application {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, { session: { userId: USER_ID } });
    next();
  });
  app.use("/api/users", usersRouter);
  return app;
}

function makeFakeHomeProfile(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    userId: USER_ID,
    latitude: REAL_LAT,
    longitude: REAL_LNG,
    fakeHomeEnabled: true,
    homeLatitude: REAL_LAT,
    homeLongitude: REAL_LNG,
    fakeHomeLatitude: FAKE_HOME_LAT,
    fakeHomeLongitude: FAKE_HOME_LNG,
    fakeHomeRadius: 2,
    fakeWorkEnabled: false,
    fakeWhateverEnabled: false,
    positionFuzz: false,
    positionFuzzKm: 0,
    offlinePositionRandomize: true,
    isAvailable: false,
    ...overrides,
  };
}

function makeUser(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: USER_ID,
    nickname: "tester",
    password: "hashed",
    avatarUrl: null,
    userType: "biker",
    role: "user",
    status: "active",
    ghostMode: false,
    lastLoginAt: new Date().toISOString(),
    sex: "m",
    region: "Lombardia",
    country: "IT",
    birthYear: 1990,
    firstLoginLat: null,
    firstLoginLng: null,
    isFake: false,
    floatingWidgetEnabled: false,
    ...overrides,
  };
}

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
    // ~0.8 km dal centro whatever → dentro il raggio di default (2 km)
    const profile = makeWhateverProfile();
    const res = applyFakeZones(WHATEVER_LAT + 0.007, WHATEVER_LNG, profile);

    expect(res.applied).toBe(true);
    expect(res.lat).toBe(FAKE_WHATEVER_LAT);
    expect(res.lng).toBe(FAKE_WHATEVER_LNG);
  });

  it("NON sostituisce le coordinate quando l'utente è oltre fakeWhateverRadius", () => {
    // ~5.5 km dal centro whatever → fuori dal raggio di default (2 km)
    const profile = makeWhateverProfile();
    const inputLat = WHATEVER_LAT + 0.05;
    const res = applyFakeZones(inputLat, WHATEVER_LNG, profile);

    expect(res.applied).toBe(false);
    expect(res.lat).toBe(inputLat);
    expect(res.lng).toBe(WHATEVER_LNG);
  });

  it("rispetta un fakeWhateverRadius personalizzato più ampio", () => {
    // ~5.5 km dal centro: fuori dai 2 km di default, dentro un raggio custom di 10 km
    const profile = makeWhateverProfile({ fakeWhateverRadius: 10 });
    const res = applyFakeZones(WHATEVER_LAT + 0.05, WHATEVER_LNG, profile);

    expect(res.applied).toBe(true);
    expect(res.lat).toBe(FAKE_WHATEVER_LAT);
    expect(res.lng).toBe(FAKE_WHATEVER_LNG);
  });

  it("usa il fallback di 2 km quando fakeWhateverRadius è null", () => {
    // ~0.8 km dal centro → dentro il fallback di 2 km
    const profile = makeWhateverProfile({ fakeWhateverRadius: null });
    const res = applyFakeZones(WHATEVER_LAT + 0.007, WHATEVER_LNG, profile);

    expect(res.applied).toBe(true);
    expect(res.lat).toBe(FAKE_WHATEVER_LAT);
    expect(res.lng).toBe(FAKE_WHATEVER_LNG);
  });
});

// ---------------------------------------------------------------------------
// BUG 1 — PUT /me deve applicare applyFakeZones prima di salvare
// ---------------------------------------------------------------------------

describe("BUG 1 — PUT /me applica applyFakeZones prima di persistere lat/lng", () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();

    vi.mocked(storage.getUser).mockResolvedValue(makeUser() as any);
    vi.mocked(storage.getUserProfile).mockResolvedValue(makeFakeHomeProfile() as any);
    vi.mocked(storage.updateUserProfile).mockResolvedValue({} as any);
    vi.mocked(storage.getUserPhotos).mockResolvedValue([]);
    vi.mocked(storage.getUserMotorcycles).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("persiste le coordinate fake (non reali) quando l'utente è nel raggio fakeHome", async () => {
    const res = await request(app)
      .put("/api/users/me")
      .send({ latitude: REAL_LAT, longitude: REAL_LNG });

    expect(res.status).toBe(200);

    const updateCalls = vi.mocked(storage.updateUserProfile).mock.calls;
    expect(updateCalls.length).toBeGreaterThanOrEqual(1);

    const savedData = updateCalls[0][1] as Record<string, unknown>;
    expect(savedData.latitude).toBe(FAKE_HOME_LAT);
    expect(savedData.longitude).toBe(FAKE_HOME_LNG);
    expect(savedData.latitude).not.toBe(REAL_LAT);
    expect(savedData.longitude).not.toBe(REAL_LNG);
  });

  it("persiste le coordinate reali quando l'utente NON è nel raggio fakeHome", async () => {
    vi.mocked(storage.getUserProfile).mockResolvedValue(
      makeFakeHomeProfile({ homeLatitude: 50.0, homeLongitude: 15.0 }) as any,
    );

    const res = await request(app)
      .put("/api/users/me")
      .send({ latitude: REAL_LAT, longitude: REAL_LNG });

    expect(res.status).toBe(200);

    const updateCalls = vi.mocked(storage.updateUserProfile).mock.calls;
    expect(updateCalls.length).toBeGreaterThanOrEqual(1);

    const savedData = updateCalls[0][1] as Record<string, unknown>;
    expect(savedData.latitude).toBe(REAL_LAT);
    expect(savedData.longitude).toBe(REAL_LNG);
  });
});

// ---------------------------------------------------------------------------
// BUG 2 — captureFirstAvailabilityLocation deve ricevere fLat/fLng
// ---------------------------------------------------------------------------

describe("BUG 2 — captureFirstAvailabilityLocation riceve coordinate già alterate", () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();

    vi.mocked(storage.getUserProfile).mockResolvedValue(makeFakeHomeProfile() as any);
    vi.mocked(storage.updateUserProfile).mockResolvedValue({} as any);
    vi.mocked(storage.getUser).mockResolvedValue(
      makeUser({ firstLoginLat: null, firstLoginLng: null }) as any,
    );
    vi.mocked(storage.updateUser).mockResolvedValue(undefined as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("PUT /me/availability salva coordinate fake in firstLoginLat/Lng quando fakeHome è attivo", async () => {
    const res = await request(app)
      .put("/api/users/me/availability")
      .send({ isAvailable: true, latitude: REAL_LAT, longitude: REAL_LNG });

    expect(res.status).toBe(200);

    const updateUserCalls = vi.mocked(storage.updateUser).mock.calls;
    const captureCall = updateUserCalls.find(
      (call) =>
        call[1] &&
        typeof (call[1] as Record<string, unknown>).firstLoginLat !== "undefined",
    );
    expect(captureCall).toBeDefined();

    const capturedData = captureCall![1] as Record<string, unknown>;
    expect(capturedData.firstLoginLat).toBe(FAKE_HOME_LAT);
    expect(capturedData.firstLoginLng).toBe(FAKE_HOME_LNG);
    expect(capturedData.firstLoginLat).not.toBe(REAL_LAT);
    expect(capturedData.firstLoginLng).not.toBe(REAL_LNG);
  });
});

// ---------------------------------------------------------------------------
// BUG 3 — POST /app-close rispetta il setting globale offline_position_randomize_default
// ---------------------------------------------------------------------------

describe("BUG 3 — POST /app-close rispetta il setting globale offline_position_randomize_default", () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();

    vi.mocked(storage.updateUser).mockResolvedValue(undefined as any);
    vi.mocked(storage.updateUserProfile).mockResolvedValue({} as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("NON scrive lastOfflineLat/Lng quando offline_position_randomize_default=false", async () => {
    vi.mocked(storage.getUserProfile).mockResolvedValue(
      makeFakeHomeProfile({ offlinePositionRandomize: true }) as any,
    );
    vi.mocked(storage.getAppSetting).mockImplementation(async (key: string) => {
      if (key === "offline_position_randomize_default") {
        return { key, value: "false" } as any;
      }
      return null;
    });

    const res = await request(app).post("/api/users/app-close").send({});

    expect(res.status).toBe(200);

    const updateProfileCalls = vi.mocked(storage.updateUserProfile).mock.calls;
    const offlineWrite = updateProfileCalls.find(
      (call) =>
        call[1] &&
        typeof (call[1] as Record<string, unknown>).lastOfflineLat !== "undefined",
    );
    expect(offlineWrite).toBeUndefined();
  });

  it("scrive lastOfflineLat/Lng quando offline_position_randomize_default non è 'false'", async () => {
    vi.mocked(storage.getUserProfile).mockResolvedValue(
      makeFakeHomeProfile({ latitude: REAL_LAT, longitude: REAL_LNG, offlinePositionRandomize: true }) as any,
    );
    vi.mocked(storage.getAppSetting).mockResolvedValue(undefined);

    const res = await request(app).post("/api/users/app-close").send({});

    expect(res.status).toBe(200);

    const updateProfileCalls = vi.mocked(storage.updateUserProfile).mock.calls;
    const offlineWrite = updateProfileCalls.find(
      (call) =>
        call[1] &&
        typeof (call[1] as Record<string, unknown>).lastOfflineLat !== "undefined",
    );
    expect(offlineWrite).toBeDefined();
  });

  it("NON scrive lastOfflineLat/Lng quando l'utente ha offlinePositionRandomize=false", async () => {
    vi.mocked(storage.getUserProfile).mockResolvedValue(
      makeFakeHomeProfile({ offlinePositionRandomize: false }) as any,
    );
    vi.mocked(storage.getAppSetting).mockResolvedValue(undefined);

    const res = await request(app).post("/api/users/app-close").send({});

    expect(res.status).toBe(200);

    const updateProfileCalls = vi.mocked(storage.updateUserProfile).mock.calls;
    const offlineWrite = updateProfileCalls.find(
      (call) =>
        call[1] &&
        typeof (call[1] as Record<string, unknown>).lastOfflineLat !== "undefined",
    );
    expect(offlineWrite).toBeUndefined();
  });
});
