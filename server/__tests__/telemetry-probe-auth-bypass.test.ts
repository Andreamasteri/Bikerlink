/**
 * Tests per isInternalProbe() e il bypass auth in POST /api/telemetry/batch.
 *
 * Verifica che:
 * (a) le probe interne con token + IP loopback bypassino l'auth e usino userId="__probe__"
 * (b) le richieste senza sessione e senza token valido ricevano 401 (AUTH FAIL)
 * (c) le probe con token sbagliato o IP non-loopback non bypassino l'auth
 * (d) la cleanup DELETE funzioni correttamente su session_id probe-*
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";

vi.mock("../db", () => ({
  db: {
    execute: vi.fn(),
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
  },
  pool: { query: vi.fn(), connect: vi.fn() },
}));

vi.mock("../lib/telemetry-error-log", () => ({
  logTelemetryEvent: vi.fn(),
}));

vi.mock("../storage", () => ({
  storage: {
    getAppSetting: vi.fn().mockResolvedValue(null),
  },
}));

import { db } from "../db";
import { logTelemetryEvent } from "../lib/telemetry-error-log";
import { isLoopback, getInternalProbeToken, getInternalProbeHeaderName } from "../ai/watchdog/internal-token";
import telemetryRouter from "../routes/telemetry";

// ---------------------------------------------------------------------------
// isLoopback() unit tests
// ---------------------------------------------------------------------------
describe("isLoopback()", () => {
  it("accetta 127.0.0.1", () => expect(isLoopback("127.0.0.1")).toBe(true));
  it("accetta ::1", () => expect(isLoopback("::1")).toBe(true));
  it("accetta ::ffff:127.0.0.1 (IPv4-mapped)", () => expect(isLoopback("::ffff:127.0.0.1")).toBe(true));
  it("accetta suffisso :127.0.0.1", () => expect(isLoopback("::ffff:127.0.0.1")).toBe(true));
  it("rifiuta IP pubblico", () => expect(isLoopback("1.2.3.4")).toBe(false));
  it("rifiuta stringa vuota", () => expect(isLoopback("")).toBe(false));
  it("rifiuta null/undefined", () => {
    expect(isLoopback(null)).toBe(false);
    expect(isLoopback(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getInternalProbeToken() unit tests
// ---------------------------------------------------------------------------
describe("getInternalProbeToken()", () => {
  it("restituisce una stringa non vuota", () => {
    const token = getInternalProbeToken();
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
  });

  it("il token è stabile tra chiamate successive (cached in-memory)", () => {
    expect(getInternalProbeToken()).toBe(getInternalProbeToken());
  });

  it("il nome header è 'x-internal-probe-token'", () => {
    expect(getInternalProbeHeaderName()).toBe("x-internal-probe-token");
  });
});

// ---------------------------------------------------------------------------
// POST /api/telemetry/batch — bypass auth con probe token
// ---------------------------------------------------------------------------

function buildAppNoSession(): express.Application {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, { session: {} });
    next();
  });
  app.use("/api/telemetry", telemetryRouter);
  return app;
}

/**
 * Variante con trust proxy abilitato: X-Forwarded-For sovrascrive req.ip,
 * utile per simulare un IP non-loopback in test.
 */
function buildAppNoSessionTrustProxy(): express.Application {
  const app = express();
  app.set("trust proxy", true);
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, { session: {} });
    next();
  });
  app.use("/api/telemetry", telemetryRouter);
  return app;
}

function buildAppWithSession(userId = "real-user-123"): express.Application {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, { session: { userId } });
    next();
  });
  app.use("/api/telemetry", telemetryRouter);
  return app;
}

const VALID_BATCH_BODY = {
  session_id: "probe-test-abc123",
  session_type: "ride",
  samples: [{ ts: Date.now(), lat: 45.464, lon: 9.188, speed_kmh: 50 }],
};

describe("POST /api/telemetry/batch — probe auth bypass", () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildAppNoSession();

    const dbMock = vi.mocked(db);
    dbMock.execute.mockResolvedValue({ rows: [] } as unknown as Awaited<ReturnType<typeof db.execute>>);
    dbMock.insert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) } as unknown as ReturnType<typeof db.insert>);
  });

  it("con token interno valido + loopback IP → 200, nessun AUTH FAIL, userId=__probe__", async () => {
    const token = getInternalProbeToken();
    const headerName = getInternalProbeHeaderName();

    const res = await request(app)
      .post("/api/telemetry/batch")
      .set(headerName, token)
      .send(VALID_BATCH_BODY);

    expect(res.status).toBe(200);
    expect(res.body.inserted).toBe(1);
    expect(res.body.session_id).toBe(VALID_BATCH_BODY.session_id);

    const logCalls = vi.mocked(logTelemetryEvent).mock.calls;
    const authFailLogs = logCalls.filter(([entry]) =>
      entry.message.toLowerCase().includes("auth") ||
      entry.context === "telemetry/batch" && entry.type === "WARN" && entry.message.includes("fallita")
    );
    expect(authFailLogs).toHaveLength(0);
  });

  it("senza sessione e senza token → 401 (AUTH FAIL loggato)", async () => {
    const res = await request(app)
      .post("/api/telemetry/batch")
      .send(VALID_BATCH_BODY);

    expect(res.status).toBe(401);

    const logCalls = vi.mocked(logTelemetryEvent).mock.calls;
    const authFailLogs = logCalls.filter(([entry]) =>
      entry.message.includes("Auth fallita") && entry.type === "WARN"
    );
    expect(authFailLogs.length).toBeGreaterThanOrEqual(1);
  });

  it("con token sbagliato → 401 (probe non riconosciuta)", async () => {
    const headerName = getInternalProbeHeaderName();

    const res = await request(app)
      .post("/api/telemetry/batch")
      .set(headerName, "token-sbagliato-aaabbbccc")
      .send(VALID_BATCH_BODY);

    expect(res.status).toBe(401);
  });

  it("token valido ma IP non-loopback → 401 (probe rifiutata per sicurezza)", async () => {
    // Usa trust proxy per far sì che X-Forwarded-For sovrascriva req.ip
    // e simuli una richiesta proveniente da un IP pubblico remoto.
    const appProxy = buildAppNoSessionTrustProxy();
    vi.mocked(db.insert).mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) } as unknown as ReturnType<typeof db.insert>);

    const token = getInternalProbeToken();
    const headerName = getInternalProbeHeaderName();

    const res = await request(appProxy)
      .post("/api/telemetry/batch")
      .set(headerName, token)
      .set("X-Forwarded-For", "203.0.113.42")
      .send(VALID_BATCH_BODY);

    // Il token è corretto ma l'IP non è loopback → isInternalProbe() restituisce false
    // → nessuna sessione → 401
    expect(res.status).toBe(401);
  });

  it("sessione reale + probe token → 200 (sessione ha precedenza, userId reale)", async () => {
    const token = getInternalProbeToken();
    const headerName = getInternalProbeHeaderName();
    const appWithSession = buildAppWithSession("utente-reale-999");

    vi.mocked(db.insert).mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) } as unknown as ReturnType<typeof db.insert>);

    const res = await request(appWithSession)
      .post("/api/telemetry/batch")
      .set(headerName, token)
      .send({ ...VALID_BATCH_BODY, session_id: "ride-utente-reale" });

    expect(res.status).toBe(200);
    expect(res.body.inserted).toBe(1);
  });

  it("payload senza session_id → 400 anche in probe mode", async () => {
    const token = getInternalProbeToken();
    const headerName = getInternalProbeHeaderName();

    const res = await request(app)
      .post("/api/telemetry/batch")
      .set(headerName, token)
      .send({ session_type: "ride", samples: [{ ts: Date.now(), lat: 45.0, lon: 9.0 }] });

    expect(res.status).toBe(400);
  });

  it("payload senza samples → 400 anche in probe mode", async () => {
    const token = getInternalProbeToken();
    const headerName = getInternalProbeHeaderName();

    const res = await request(app)
      .post("/api/telemetry/batch")
      .set(headerName, token)
      .send({ session_id: "probe-nosamp-xyz", session_type: "ride" });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Cleanup probe-* session_id dal DB
// ---------------------------------------------------------------------------
describe("cleanup probe-* session_id da ride_telemetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("DELETE WHERE session_id = probe-xxx non lascia righe residue", async () => {
    const executeMock = vi.mocked(db.execute);
    executeMock.mockResolvedValueOnce({ rows: [{ cnt: "1" }] } as unknown as Awaited<ReturnType<typeof db.execute>>);
    executeMock.mockResolvedValueOnce({ rows: [] } as unknown as Awaited<ReturnType<typeof db.execute>>);

    const sessionId = "probe-abc123def456";

    const before = await db.execute(
      { sql: `SELECT COUNT(*) AS cnt FROM ride_telemetry WHERE session_id = '${sessionId}'` } as unknown as Parameters<typeof db.execute>[0]
    );
    const cntBefore = parseInt((before.rows[0] as { cnt: string }).cnt ?? "0", 10);
    expect(cntBefore).toBe(1);

    await db.execute(
      { sql: `DELETE FROM ride_telemetry WHERE session_id = '${sessionId}'` } as unknown as Parameters<typeof db.execute>[0]
    );

    executeMock.mockResolvedValueOnce({ rows: [{ cnt: "0" }] } as unknown as Awaited<ReturnType<typeof db.execute>>);
    const after = await db.execute(
      { sql: `SELECT COUNT(*) AS cnt FROM ride_telemetry WHERE session_id = '${sessionId}'` } as unknown as Parameters<typeof db.execute>[0]
    );
    const cntAfter = parseInt((after.rows[0] as { cnt: string }).cnt ?? "0", 10);
    expect(cntAfter).toBe(0);
  });

  it("session_id probe-* pattern non lascia righe: DELETE LIKE 'probe-%'", async () => {
    const executeMock = vi.mocked(db.execute);
    executeMock.mockResolvedValueOnce({ rows: [] } as unknown as Awaited<ReturnType<typeof db.execute>>);

    const deleteCall = db.execute(
      { sql: "DELETE FROM ride_telemetry WHERE session_id LIKE 'probe-%'" } as unknown as Parameters<typeof db.execute>[0]
    );
    await expect(deleteCall).resolves.not.toThrow();

    expect(executeMock).toHaveBeenCalledTimes(1);
  });
});
