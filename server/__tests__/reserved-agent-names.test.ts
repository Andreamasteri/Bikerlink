/**
 * Task #119 — blocca nickname/email che imitano gli agenti AI interni
 * (Ares, Nadir, Bowie, Quebracho, Horus).
 *
 * Copertura:
 *   - unit test sui validator condivisi (shared/validators/auth.ts): match
 *     "contains" case-insensitive in posizione iniziale/centrale/finale, sia
 *     su nickname che su email, e nickname legittimi che NON devono essere
 *     bloccati.
 *   - integrazione: POST /api/auth/register (signup pubblico) rifiuta
 *     nickname/email che imitano un agente.
 *   - integrazione: POST /api/admin/users (creazione utente da admin) rifiuta
 *     allo stesso modo, così il percorso admin non è un bypass.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import {
  isReservedNickname,
  isReservedEmailLocalPart,
  RESERVED_AI_AGENT_NAMES,
} from "@shared/validators";

describe("shared validators — isReservedNickname / isReservedEmailLocalPart", () => {
  it("blocca ogni nome di agente AI come nickname esatto (case-insensitive)", () => {
    for (const name of RESERVED_AI_AGENT_NAMES) {
      expect(isReservedNickname(name)).toBe(true);
      expect(isReservedNickname(name.toUpperCase())).toBe(true);
    }
  });

  it("blocca il nome dell'agente in posizione iniziale, centrale e finale nel nickname", () => {
    expect(isReservedNickname("AresAdmin")).toBe(true);
    expect(isReservedNickname("il_bowie99")).toBe(true);
    expect(isReservedNickname("SuperNadirFan")).toBe(true);
    expect(isReservedNickname("Team_Horus")).toBe(true);
    expect(isReservedNickname("xQUEBRACHOx")).toBe(true);
  });

  it("blocca la parte locale dell'email che imita un agente, in qualunque posizione", () => {
    expect(isReservedEmailLocalPart("nadir@example.com")).toBe(true);
    expect(isReservedEmailLocalPart("mario.bowie99@example.com")).toBe(true);
    expect(isReservedEmailLocalPart("teamHORUS@example.com")).toBe(true);
    expect(isReservedEmailLocalPart("xArEsX@example.com")).toBe(true);
  });

  it("non blocca nickname/email legittimi non correlati", () => {
    expect(isReservedNickname("MotoRider99")).toBe(false);
    expect(isReservedNickname("BikerLink_Official")).toBe(false);
    expect(isReservedNickname("giulia_2000")).toBe(false);
    expect(isReservedEmailLocalPart("mario.rossi@example.com")).toBe(false);
    expect(isReservedEmailLocalPart("giulia2000@example.com")).toBe(false);
  });

  it("continua a bloccare esattamente admin/moderator (comportamento storico)", () => {
    expect(isReservedNickname("admin")).toBe(true);
    expect(isReservedNickname("Moderator")).toBe(true);
    // match esatto storico: non "contains" per queste parole, per non
    // rompere nickname legittimi che le contengono come sotto-parola.
    expect(isReservedNickname("administrationfan")).toBe(false);
  });
});

// ── Module mocks per il router reale di register.ts ─────────────────────────
const {
  mockGetUserByEmail,
  mockGetUserByNickname,
  mockCreateUser,
} = vi.hoisted(() => ({
  mockGetUserByEmail: vi.fn(),
  mockGetUserByNickname: vi.fn(),
  mockCreateUser: vi.fn(),
}));

vi.mock("../db", () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({ onConflictDoNothing: vi.fn().mockResolvedValue(undefined) }),
    }),
  },
  withDbTimeout: (p: Promise<unknown>) => p,
  DbTimeoutError: class DbTimeoutError extends Error {},
}));

vi.mock("../storage", () => ({
  storage: {
    getUserByEmail: mockGetUserByEmail,
    getUserByNickname: mockGetUserByNickname,
    createUser: mockCreateUser,
    createUserProfile: vi.fn().mockResolvedValue(undefined),
    getAppSetting: vi.fn().mockResolvedValue(undefined),
    getInvitationCode: vi.fn().mockResolvedValue(null),
    incrementInvitationCodeUses: vi.fn().mockResolvedValue(undefined),
    markUserEmailVerified: vi.fn().mockResolvedValue(undefined),
    createEmailVerificationToken: vi.fn().mockResolvedValue(undefined),
    createNotification: vi.fn().mockResolvedValue(undefined),
    createConversation: vi.fn().mockResolvedValue({ id: "conv1" }),
    addConversationParticipant: vi.fn().mockResolvedValue(undefined),
    createMessage: vi.fn().mockResolvedValue(undefined),
    updateConversationTimestamp: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../email", () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(true),
  sendInvitationGiftEmail: vi.fn().mockResolvedValue(undefined),
  sendNewUserNotificationEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../motoclubs", () => ({
  createRegionalClubInvite: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/visitor-tracking", () => ({
  parseVisitorCookie: vi.fn().mockReturnValue(null),
  recordVisit: vi.fn(),
}));

vi.mock("cookie-signature", () => ({
  default: { sign: vi.fn().mockReturnValue("signed") },
  sign: vi.fn().mockReturnValue("signed"),
}));

vi.mock("express-rate-limit", () => {
  const passthrough = () => (_req: Request, _res: Response, next: NextFunction) => next();
  class MemoryStore {
    init() {}
    increment(_key: string, cb: Function) { cb(null, { totalHits: 1, resetTime: new Date() }); }
    decrement(_key: string) {}
    resetKey(_key: string) {}
    resetAll() {}
    localKeys = true;
  }
  return { default: passthrough, rateLimit: passthrough, MemoryStore };
});

describe("POST /api/auth/register — blocca nickname/email che imitano un agente AI", () => {
  let app: import("express").Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetUserByEmail.mockResolvedValue(null);
    mockGetUserByNickname.mockResolvedValue(null);
    mockCreateUser.mockResolvedValue({
      id: "u1",
      nickname: "placeholder",
      email: "placeholder@example.com",
      password: "hashed",
    });

    const express = (await import("express")).default;
    const registerRouter = (await import("../routes/auth/register")).default;
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as unknown as { session: Record<string, unknown> }).session = {
        save: (cb: (err?: unknown) => void) => cb(),
      };
      (req as unknown as { sessionID: string }).sessionID = "sess1";
      next();
    });
    app.use("/api/auth", registerRouter);
  });

  const basePayload = {
    email: "mario.rossi@example.com",
    password: "Password1",
    userType: "biker" as const,
    eulaAccepted: true as const,
  };

  it("rifiuta un nickname con nome agente in posizione iniziale", async () => {
    const request = (await import("supertest")).default;
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...basePayload, nickname: "AresPilot" });
    expect(res.status).toBe(400);
  });

  it("rifiuta un nickname con nome agente in posizione centrale/finale, casing misto", async () => {
    const request = (await import("supertest")).default;
    const res1 = await request(app)
      .post("/api/auth/register")
      .send({ ...basePayload, nickname: "Team_HoRuS_99" });
    expect(res1.status).toBe(400);

    const res2 = await request(app)
      .post("/api/auth/register")
      .send({ ...basePayload, nickname: "il_bowie" });
    expect(res2.status).toBe(400);
  });

  it("rifiuta un'email la cui parte locale contiene un nome agente", async () => {
    const request = (await import("supertest")).default;
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...basePayload, nickname: "MotoRider99", email: "quebracho.fan@example.com" });
    expect(res.status).toBe(400);
  });

  it("accetta un nickname/email legittimo non correlato", async () => {
    const request = (await import("supertest")).default;
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...basePayload, nickname: "MotoRider99", email: "mario.rossi99@example.com" });
    expect(res.status).toBe(201);
  });
});

// ── Module mocks per il router reale di admin/users.next.ts ─────────────────
const {
  mockAdminGetUserByEmail,
  mockAdminGetUserByNickname,
  mockAdminCreateUser,
  mockCreateModeratorLog,
} = vi.hoisted(() => ({
  mockAdminGetUserByEmail: vi.fn(),
  mockAdminGetUserByNickname: vi.fn(),
  mockAdminCreateUser: vi.fn(),
  mockCreateModeratorLog: vi.fn(),
}));

vi.mock("../online-tracker", () => ({
  onlineTracker: { getOnlineUserIds: vi.fn().mockReturnValue([]), size: vi.fn().mockReturnValue(0) },
}));

describe("POST /api/admin/users — stessa regola sul percorso di creazione admin", () => {
  let app: import("express").Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockAdminGetUserByEmail.mockResolvedValue(null);
    mockAdminGetUserByNickname.mockResolvedValue(null);
    mockAdminCreateUser.mockResolvedValue({
      id: "u2",
      nickname: "placeholder",
      email: "placeholder@example.com",
      password: "hashed",
    });

    // Reset the ../storage mock used above with admin-relevant methods.
    const storageModule = await import("../storage");
    (storageModule.storage as unknown as Record<string, unknown>).getUserByEmail = mockAdminGetUserByEmail;
    (storageModule.storage as unknown as Record<string, unknown>).getUserByNickname = mockAdminGetUserByNickname;
    (storageModule.storage as unknown as Record<string, unknown>).createUser = mockAdminCreateUser;
    (storageModule.storage as unknown as Record<string, unknown>).createModeratorLog = mockCreateModeratorLog;

    const express = (await import("express")).default;
    const usersNextRouter = (await import("../routes/admin/users.next")).default;
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as unknown as { session: Record<string, unknown> }).session = { userId: "admin1" };
      next();
    });
    app.use("/api/admin/users", usersNextRouter);
  });

  const basePayload = {
    email: "mario.rossi@example.com",
    password: "Password1",
    userType: "biker" as const,
  };

  it("rifiuta un nickname con nome agente (posizione iniziale)", async () => {
    const request = (await import("supertest")).default;
    const res = await request(app)
      .post("/api/admin/users")
      .send({ ...basePayload, nickname: "HorusBot" });
    expect(res.status).toBe(400);
  });

  it("rifiuta un nickname con nome agente (posizione centrale/finale, casing misto)", async () => {
    const request = (await import("supertest")).default;
    const res1 = await request(app)
      .post("/api/admin/users")
      .send({ ...basePayload, nickname: "Team_NaDiR" });
    expect(res1.status).toBe(400);

    const res2 = await request(app)
      .post("/api/admin/users")
      .send({ ...basePayload, nickname: "super_ares" });
    expect(res2.status).toBe(400);
  });

  it("rifiuta un'email la cui parte locale contiene un nome agente", async () => {
    const request = (await import("supertest")).default;
    const res = await request(app)
      .post("/api/admin/users")
      .send({ ...basePayload, nickname: "MotoRider99", email: "bowie.fan@example.com" });
    expect(res.status).toBe(400);
  });

  it("accetta un nickname/email legittimo non correlato", async () => {
    const request = (await import("supertest")).default;
    const res = await request(app)
      .post("/api/admin/users")
      .send({ ...basePayload, nickname: "MotoRider99", email: "mario.rossi99@example.com" });
    expect(res.status).toBe(201);
  });
});

describe("PUT /api/admin/users/:id/email — un admin non può assegnare un'email che imita un agente AI", () => {
  let app: import("express").Express;

  const EXISTING_USER = {
    id: "u77",
    nickname: "MotoRider99",
    email: "old@example.com",
    password: "hashed",
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const storageModule = await import("../storage");
    const s = storageModule.storage as unknown as Record<string, unknown>;
    s.getUser = vi.fn().mockResolvedValue(EXISTING_USER);
    s.updateUser = vi.fn().mockResolvedValue({ ...EXISTING_USER, email: "new@example.com" });
    s.createModeratorLog = mockCreateModeratorLog;

    const express = (await import("express")).default;
    const usersRouter = (await import("../routes/admin/users")).default;
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as unknown as { session: Record<string, unknown> }).session = { userId: "admin1" };
      next();
    });
    app.use("/api/admin/users", usersRouter);
  });

  it("rifiuta un'email la cui parte locale contiene un nome agente (posizione iniziale)", async () => {
    const request = (await import("supertest")).default;
    const res = await request(app)
      .put("/api/admin/users/u77/email")
      .send({ email: "horus@example.com" });
    expect(res.status).toBe(400);
  });

  it("rifiuta un'email la cui parte locale contiene un nome agente (posizione centrale/finale, casing misto)", async () => {
    const request = (await import("supertest")).default;
    const res1 = await request(app)
      .put("/api/admin/users/u77/email")
      .send({ email: "ares.something@example.com" });
    expect(res1.status).toBe(400);

    const res2 = await request(app)
      .put("/api/admin/users/u77/email")
      .send({ email: "team_NaDiR@example.com" });
    expect(res2.status).toBe(400);
  });

  it("accetta un'email legittima non correlata", async () => {
    const request = (await import("supertest")).default;
    const res = await request(app)
      .put("/api/admin/users/u77/email")
      .send({ email: "mario.rossi99@example.com" });
    expect(res.status).toBe(200);
  });
});

// ── Module mocks aggiuntivi per il router reale di users/profile.ts ──────────

vi.mock("../lib/auth-middleware", () => ({
  requireAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock("../lib/api-response", () => ({
  sendSuccess: (res: Response, data?: unknown) => res.json({ ok: true, ...(data ?? {}) }),
  sendError: (res: Response, status: number, message: string) => res.status(status).json({ error: message }),
}));

vi.mock("../lib/map-visibility", () => ({
  revealOnFirstCoordinate: (_update: unknown, _existing: unknown, _lat: unknown, _lng: unknown) => _update,
}));

vi.mock("../lib/privacy-log", () => ({
  logPrivacySettingFireAndForget: vi.fn(),
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

vi.mock("../routes/users", () => ({
  applyFakeZones: vi.fn().mockReturnValue({ applied: false, lat: 0, lng: 0 }),
  applyPositionFuzz: vi.fn().mockReturnValue({ lat: 0, lng: 0 }),
  captureFirstAvailabilityLocation: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../routes/motoclubs/utils", () => ({
  createRegionalClubInvite: vi.fn().mockResolvedValue(undefined),
}));

// ── Audit: percorso admin rename nickname esistente? ─────────────────────────
// Task #129: audit eseguito su server/routes/admin/users.ts,
// users.next.ts, users-extra.ts, users.next-detail.ts.
// Risultato: NESSUN endpoint PUT/PATCH /:id/nickname esiste.
// I soli percorsi di scrittura del nickname sono:
//   • POST /api/auth/register      → register.ts (già coperto sopra)
//   • POST /api/admin/users        → users.next.ts (già coperto sopra)
//   • PUT  /api/users/me           → routes/users/profile.ts (coperto qui sotto)
// Se un endpoint admin di rename viene aggiunto in futuro, aggiungere qui
// un describe corrispondente che verifica il blocco isReservedNickname.

describe("PUT /api/users/me — rinomina self-service bloccata dai nomi agente AI", () => {
  let app: import("express").Express;

  const EXISTING_USER = {
    id: "u99",
    nickname: "OldNick",
    email: "user@example.com",
    password: "hashed",
    userType: "biker",
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Configura lo storage mock per le chiamate che PUT /me esegue.
    const storageModule = await import("../storage");
    const s = storageModule.storage as unknown as Record<string, unknown>;
    s.getUserByNickname = vi.fn().mockResolvedValue(null);
    s.updateUser = vi.fn().mockResolvedValue(undefined);
    s.getUser = vi.fn().mockResolvedValue(EXISTING_USER);
    s.getUserProfile = vi.fn().mockResolvedValue(null);
    s.getUserPhotos = vi.fn().mockResolvedValue([]);
    s.getUserMotorcycles = vi.fn().mockResolvedValue([]);
    s.updateUserProfile = vi.fn().mockResolvedValue(undefined);
    s.createUserProfile = vi.fn().mockResolvedValue(undefined);

    const express = (await import("express")).default;
    const profileRouter = (await import("../routes/users/profile")).default;
    app = express();
    app.use(express.json());
    // Simula session con userId loggato.
    app.use((req, _res, next) => {
      (req as unknown as { session: Record<string, unknown> }).session = { userId: "u99" };
      next();
    });
    app.use("/api/users", profileRouter);
  });

  it("rifiuta la rinomina verso un nickname che contiene un nome agente AI (posizione iniziale)", async () => {
    const request = (await import("supertest")).default;
    const res = await request(app)
      .put("/api/users/me")
      .send({ nickname: "AresFan" });
    expect(res.status).toBe(400);
  });

  it("rifiuta la rinomina verso un nickname che contiene un nome agente AI (casing misto, posizione centrale/finale)", async () => {
    const request = (await import("supertest")).default;
    const res1 = await request(app)
      .put("/api/users/me")
      .send({ nickname: "il_HoRuS_99" });
    expect(res1.status).toBe(400);

    const res2 = await request(app)
      .put("/api/users/me")
      .send({ nickname: "TeamNadir" });
    expect(res2.status).toBe(400);
  });

  it("rifiuta anche admin/moderator (comportamento esatto storico conservato)", async () => {
    const request = (await import("supertest")).default;
    const res = await request(app)
      .put("/api/users/me")
      .send({ nickname: "moderator" });
    expect(res.status).toBe(400);
  });

  it("accetta una rinomina con nickname legittimo non riservato", async () => {
    const request = (await import("supertest")).default;
    const res = await request(app)
      .put("/api/users/me")
      .send({ nickname: "MotoRider99" });
    expect(res.status).toBe(200);
  });
});
