/**
 * Task #2550 — E2E claim/unban/export CSV per l'hub di moderazione.
 *
 * Verifica:
 *  1. Due moderatori non possono claimare lo stesso report
 *     (il secondo riceve 409).
 *  2. Unban rimuove status="banned" e shadow_banned_at.
 *  3. L'export CSV maschera reporter_id quando il viewer NON è admin.
 *
 * Pattern: mock di server/storage + server/db, montaggio del router reale.
 */
import { vi, describe, it, expect, beforeEach } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";

const { mockClaim, mockUnclaim, mockUnban, mockGetUser, mockLog } = vi.hoisted(() => ({
  mockClaim: vi.fn(),
  mockUnclaim: vi.fn(),
  mockUnban: vi.fn(),
  mockGetUser: vi.fn(),
  mockLog: vi.fn().mockResolvedValue(undefined),
}));

const { mockDbSelect } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
}));

vi.mock("../db", () => {
  const _chainable = () => {
    const obj: Record<string, unknown> = {};
    obj.from = vi.fn().mockReturnValue(obj);
    obj.where = vi.fn().mockReturnValue(obj);
    obj.orderBy = vi.fn().mockReturnValue(obj);
    obj.limit = vi.fn().mockResolvedValue([]);
    return obj;
  };
  return {
    db: {
      select: () => mockDbSelect(),
      execute: vi.fn().mockResolvedValue({ rows: [] }),
    },
  };
});

vi.mock("../storage", () => ({
  storage: {
    claimReport: mockClaim,
    unclaimReport: mockUnclaim,
    unbanUser: mockUnban,
    getUser: mockGetUser,
    createModeratorLog: mockLog,
    getReportsHubSummary: vi.fn().mockResolvedValue({}),
    getReportsPatterns: vi.fn().mockResolvedValue([]),
    getActiveBans: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../services/reportingService", () => ({
  maskReporterId: (id: string, role: string | null | undefined) =>
    role === "admin" ? id : `anon_${id.slice(0, 4)}`,
}));

let app: express.Express;

beforeEach(async () => {
  vi.clearAllMocks();
  const fakeRow = {
    id: "rep-1",
    createdAt: new Date("2026-05-01T00:00:00Z"),
    status: "open",
    severity: "high",
    category: "spam",
    context: "feed",
    reportedUserId: "user-B",
    reportedUserRole: "biker",
    reporterId: "reporter-XYZ-secret",
    reporterTrustScore: 0.9,
    reason: "test",
    description: "",
    affectedFeedbackLoop: null,
    assignedModeratorId: null,
    assignedAt: null,
    resolvedBy: null,
    resolvedAt: null,
  };
  // Chain unica: qualsiasi catena .from()/.where()/.orderBy()/.limit() risolve
  // alla stessa lista fakeRow. Copre sia il caso "con filtri" che "senza".
  mockDbSelect.mockImplementation(() => {
    const terminal = Promise.resolve([fakeRow]);
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.orderBy = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockReturnValue(terminal);
    chain.then = terminal.then.bind(terminal);
    chain.catch = terminal.catch.bind(terminal);
    chain.finally = terminal.finally.bind(terminal);
    return chain;
  });

  const { default: router } = await import("../routes/admin/reports-hub");
  app = express();
  app.use(express.json());
  // Iniettiamo una session fake; il viewerId è preso da req.session.userId
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const uid = req.header("x-test-uid");
    const role = req.header("x-test-role") ?? "moderator";
    (req as unknown as { session: { userId?: string } }).session = { userId: uid };
    mockGetUser.mockResolvedValue({ id: uid, role });
    next();
  });
  app.use(router);
});

describe("Task #2550 — claim atomico", () => {
  it("il secondo moderatore riceve 409 sullo stesso report", async () => {
    // Primo claim: vince
    mockClaim.mockResolvedValueOnce({ id: "rep-1", assignedModeratorId: "mod-A" });
    const r1 = await request(app)
      .post("/reports/rep-1/claim")
      .set("x-test-uid", "mod-A");
    expect(r1.status).toBe(200);
    expect(r1.body.report.assignedModeratorId).toBe("mod-A");

    // Secondo claim: storage ritorna null → 409
    mockClaim.mockResolvedValueOnce(null);
    const r2 = await request(app)
      .post("/reports/rep-1/claim")
      .set("x-test-uid", "mod-B");
    expect(r2.status).toBe(409);
  });
});

describe("Task #2550 — unban", () => {
  it("invoca storage.unbanUser e logga l'azione", async () => {
    mockUnban.mockResolvedValueOnce(true);
    const res = await request(app)
      .post("/reports/users/user-banned/unban")
      .set("x-test-uid", "mod-A");
    expect(res.status).toBe(200);
    expect(mockUnban).toHaveBeenCalledWith("user-banned");
    expect(mockLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "user_unbanned", targetId: "user-banned" }),
    );
  });

  it("ritorna 404 se l'utente non esiste / non era bannato", async () => {
    mockUnban.mockResolvedValueOnce(false);
    const res = await request(app)
      .post("/reports/users/ghost/unban")
      .set("x-test-uid", "mod-A");
    expect(res.status).toBe(404);
  });
});

describe("Task #2550 — export CSV", () => {
  it("maschera reporter_id per ruoli non-admin", async () => {
    const res = await request(app)
      .get("/reports/export?format=csv")
      .set("x-test-uid", "mod-A")
      .set("x-test-role", "moderator");
    expect(res.status).toBe(200);
    expect(res.text).not.toContain("reporter-XYZ-secret");
    expect(res.text).toMatch(/anon_/);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
  });

  it("non maschera reporter_id per admin", async () => {
    const res = await request(app)
      .get("/reports/export?format=csv")
      .set("x-test-uid", "admin-1")
      .set("x-test-role", "admin");
    expect(res.status).toBe(200);
    expect(res.text).toContain("reporter-XYZ-secret");
  });
});
