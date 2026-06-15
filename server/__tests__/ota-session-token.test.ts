/**
 * Verifica copertura: boot pre-login con sessionToken nel body.
 *
 * Test di integrazione per POST /api/ota/event:
 *  - Senza sessione cookie/header, ma con body.sessionToken valido,
 *    il server recupera userId dalla session table tramite pool.query
 *    e registra l'evento con il userId corretto.
 *  - Senza sessionToken (e senza sessione), la risposta è ok:true + ignored:"no_session".
 *  - Con sessionToken che punta a una sessione senza userId, risposta ignored:"no_session".
 *
 * I test mockano pool.query e db per evitare dipendenza dal DB reale.
 */
import { vi, describe, it, expect, beforeEach } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";

// ── mock pool e db prima dell'import del router ────────────────────────────
const mockPoolQuery = vi.hoisted(() => vi.fn());
// mockDbInsertValues è una spia stabile: ci consente di asserire il payload
// passato a db.insert(...).values({ userId, ... }) nel corpo del test.
const mockDbInsertValues = vi.hoisted(() => vi.fn());
const mockDbInsertValuesConflictReturning = vi.hoisted(() => vi.fn());
const mockDbUpdateSetWhere = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("../db", () => {
  const makeSelectChain = () => {
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockResolvedValue([]);
    chain.orderBy = vi.fn().mockReturnValue(chain);
    return chain;
  };

  return {
    db: {
      select: vi.fn().mockImplementation(() => makeSelectChain()),
      insert: vi.fn().mockImplementation(() => ({
        values: mockDbInsertValues,
      })),
      update: vi.fn().mockImplementation(() => ({
        set: vi.fn().mockReturnValue({
          where: mockDbUpdateSetWhere,
        }),
      })),
    },
    pool: {
      query: mockPoolQuery,
    },
  };
});

// ── import del router (DOPO i mock) ───────────────────────────────────────
import otaPublicRouter from "../routes/ota-public";

// ── factory dell'app di test ───────────────────────────────────────────────
function buildApp(sessionUserId?: string) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { session: { userId?: string } }).session = {
      userId: sessionUserId,
    };
    next();
  });
  app.use("/api/ota", otaPublicRouter);
  return app;
}

// ── setup ─────────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  // Default: pool.query non trova la sessione
  mockPoolQuery.mockResolvedValue({ rows: [] });
  // Default: insert restituisce una riga nuova
  mockDbInsertValuesConflictReturning.mockResolvedValue([{ id: "evt-new-1" }]);
  mockDbUpdateSetWhere.mockResolvedValue(undefined);
  // mockDbInsertValues ritorna la catena .onConflictDoNothing().returning()
  mockDbInsertValues.mockReturnValue({
    onConflictDoNothing: vi.fn().mockReturnValue({
      returning: mockDbInsertValuesConflictReturning,
    }),
  });
});

// ── body base valido (releaseId diretto, evita il lookup via easUpdateId) ──
const BASE_BODY = {
  releaseId: "rel-abc-001",
  deviceId: "device-test-001",
  eventType: "downloaded",
  platform: "ios",
  appVersion: "54.10.27",
};

// ══════════════════════════════════════════════════════════════════════════
// Scenario 1 — sessionToken valido nel body, nessuna sessione cookie/header
// ══════════════════════════════════════════════════════════════════════════
describe("POST /api/ota/event — sessionToken nel body senza sessione attiva", () => {
  it("registra l'evento con userId estratto dalla session table", async () => {
    // pool.query simula: il SID 'my-session-id' è associato a userId 'user-abc-123'
    mockPoolQuery.mockResolvedValue({
      rows: [{ sess: { userId: "user-abc-123" } }],
    });

    const app = buildApp(undefined); // nessun userId in sessione
    const res = await request(app)
      .post("/api/ota/event")
      .send({
        ...BASE_BODY,
        // Token formato express-session URL-encoded: s:<sid>.<hmac>
        sessionToken: "s%3Amy-session-id.my-hmac",
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.ignored).toBeUndefined();

    // pool.query deve essere stato chiamato con il SID estratto dal token
    expect(mockPoolQuery).toHaveBeenCalledWith(
      "SELECT sess FROM session WHERE sid = $1 LIMIT 1",
      ["my-session-id"]
    );

    // L'insert deve essere avvenuto con il userId ricavato dalla sessione
    expect(mockDbInsertValues).toHaveBeenCalledTimes(1);
    expect(mockDbInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-abc-123" })
    );
    expect(mockDbInsertValuesConflictReturning).toHaveBeenCalledTimes(1);
  });

  it("decodifica correttamente il token NON URL-encoded (s:<sid>.<hmac>)", async () => {
    mockPoolQuery.mockResolvedValue({
      rows: [{ sess: { userId: "user-xyz-456" } }],
    });

    const app = buildApp(undefined);
    const res = await request(app)
      .post("/api/ota/event")
      .send({
        ...BASE_BODY,
        sessionToken: "s:another-session-id.signature",
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockPoolQuery).toHaveBeenCalledWith(
      "SELECT sess FROM session WHERE sid = $1 LIMIT 1",
      ["another-session-id"]
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Scenario 2 — nessun sessionToken e nessuna sessione → ignored:"no_session"
// ══════════════════════════════════════════════════════════════════════════
describe("POST /api/ota/event — nessuna sessione e nessun sessionToken", () => {
  it("risponde ok:true con ignored:no_session senza toccare il DB", async () => {
    const app = buildApp(undefined);
    const res = await request(app)
      .post("/api/ota/event")
      .send(BASE_BODY); // no sessionToken

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.ignored).toBe("no_session");

    // pool.query NON deve essere chiamato (nessun token da cercare)
    expect(mockPoolQuery).not.toHaveBeenCalled();
    expect(mockDbInsertValuesConflictReturning).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Scenario 3 — sessionToken valido ma la sessione non ha userId
// ══════════════════════════════════════════════════════════════════════════
describe("POST /api/ota/event — sessionToken punta a sessione senza userId", () => {
  it("risponde ok:true con ignored:no_session", async () => {
    // La sessione esiste ma non contiene userId (sessione anonima o scaduta)
    mockPoolQuery.mockResolvedValue({
      rows: [{ sess: {} }],
    });

    const app = buildApp(undefined);
    const res = await request(app)
      .post("/api/ota/event")
      .send({
        ...BASE_BODY,
        sessionToken: "s%3Aanon-session-id.sig",
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.ignored).toBe("no_session");
    expect(mockDbInsertValuesConflictReturning).not.toHaveBeenCalled();
  });

  it("risponde ok:true con ignored:no_session quando la sessione non esiste", async () => {
    // pool.query non trova righe → userId non ricavabile
    mockPoolQuery.mockResolvedValue({ rows: [] });

    const app = buildApp(undefined);
    const res = await request(app)
      .post("/api/ota/event")
      .send({
        ...BASE_BODY,
        sessionToken: "s%3Anonexistent-session.sig",
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.ignored).toBe("no_session");
    expect(mockDbInsertValuesConflictReturning).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Scenario 4 — sessione attiva via req.session.userId (percorso normale)
//              In questo caso pool.query NON deve essere invocato.
// ══════════════════════════════════════════════════════════════════════════
describe("POST /api/ota/event — sessione attiva via req.session (percorso normale)", () => {
  it("usa req.session.userId senza chiamare pool.query", async () => {
    const app = buildApp("user-logged-in-789"); // userId già in sessione
    const res = await request(app)
      .post("/api/ota/event")
      .send(BASE_BODY); // nessun sessionToken nel body

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.ignored).toBeUndefined();

    // pool.query NON deve essere chiamato: userId già disponibile dalla sessione
    expect(mockPoolQuery).not.toHaveBeenCalled();
    expect(mockDbInsertValuesConflictReturning).toHaveBeenCalledTimes(1);
  });
});
