/**
 * Test copertura POST /api/admin/ota/:id/republish
 *
 * Casi coperti:
 *  1. Parser output EAS — output valido con "Android update ID" → updateId/groupId corretti
 *  2. Parser output EAS — output valido con "iOS update ID" → updateId/groupId corretti
 *  3. Parser output EAS — output valido con "Update ID" generico → updateId/groupId corretti
 *  4. Parser output EAS — nessun match → 500 esplicito (nessun ID inventato)
 *  5. Parser output EAS — updateId presente ma groupId assente → 500 esplicito
 *  6. Guard: easGroupId mancante → 400
 *  7. Guard: EAS_TOKEN assente → 500
 *  8. Guard: release inesistente → 404
 *  9. Inserimento riga con status='pending' e channel='production'
 */
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";

// ── UUID fittizi ────────────────────────────────────────────────────────────
const RELEASE_ID = "aaaaaaaa-0000-0000-0000-000000000001";
const EXISTING_GROUP_ID = "bbbbbbbb-0000-0000-0000-000000000002";
const EXISTING_UPDATE_ID = "cccccccc-0000-0000-0000-000000000003";
const NEW_UPDATE_ID = "dddddddd-0000-0000-0000-000000000004";
const NEW_GROUP_ID = "eeeeeeee-0000-0000-0000-000000000005";

// ── helpers per costruire output EAS ───────────────────────────────────────
const makeEasOutput = (updateIdLabel: string, updateId: string, groupId: string) =>
  `Republishing update...\n${updateIdLabel}  ${updateId}\nUpdate group ID  ${groupId}\nDone.`;

// ── mock child_process.execFile ─────────────────────────────────────────────
const mockExecFile = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ execFile: mockExecFile }));

// promisify wrappa execFile: dobbiamo fare in modo che chiami il callback
// con (null, { stdout, stderr }) per simulare successo.
vi.mock("node:util", () => ({
  promisify: (fn: (...args: unknown[]) => void) =>
    (...args: unknown[]) =>
      new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        fn(...args, (err: Error | null, result: { stdout: string; stderr: string }) => {
          if (err) reject(err);
          else resolve(result);
        });
      }),
}));

// ── mock db ────────────────────────────────────────────────────────────────
const mockInsertValues = vi.hoisted(() => vi.fn());
const mockInsertValuesConflictSetReturning = vi.hoisted(() => vi.fn());

vi.mock("../db", () => {
  const makeSelectChain = (rows: unknown[]) => {
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockResolvedValue(rows);
    return chain;
  };

  return {
    db: {
      select: vi.fn().mockImplementation(() => makeSelectChain([])),
      insert: vi.fn().mockImplementation(() => ({
        values: mockInsertValues,
      })),
    },
  };
});

// Importiamo db dopo i mock per poter ridefinire select per-test
import { db } from "../db";

// ── mock ota-sync (richiesto da ota.part2) ─────────────────────────────────
vi.mock("../routes/admin/ota-sync", () => ({ EAS_PROJECT_ID: "test-project" }));

// ── mock sendError via api-response ────────────────────────────────────────
vi.mock("../lib/api-response", () => ({
  sendError: (res: Response, status: number, msg: string) =>
    res.status(status).json({ error: msg }),
}));

// ── import router DOPO i mock ──────────────────────────────────────────────
import otaPart2Router from "../routes/admin/ota.part2";

// ── factory app di test ────────────────────────────────────────────────────
function buildApp(sessionUserId = "admin-user-1") {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { session: { userId: string } }).session = {
      userId: sessionUserId,
    };
    next();
  });
  app.use("/api/admin/ota", otaPart2Router);
  return app;
}

// ── record base di una release ─────────────────────────────────────────────
const BASE_RELEASE = {
  id: RELEASE_ID,
  easUpdateId: EXISTING_UPDATE_ID,
  easGroupId: EXISTING_GROUP_ID,
  channel: "production",
  runtimeVersion: "54",
  message: "Previous release",
  otaVersion: "54.10.100",
  status: "pending",
};

// ── setup / teardown ───────────────────────────────────────────────────────
const originalEasToken = process.env.EAS_TOKEN;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.EAS_TOKEN = "test-eas-token";

  // Default: release trovata
  (db.select as ReturnType<typeof vi.fn>).mockImplementation(() => {
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockResolvedValue([BASE_RELEASE]);
    return chain;
  });

  // Default insert chain
  mockInsertValuesConflictSetReturning.mockResolvedValue([
    { id: "new-rel-1", easUpdateId: NEW_UPDATE_ID, status: "pending" },
  ]);
  mockInsertValues.mockReturnValue({
    onConflictDoUpdate: vi.fn().mockReturnValue({
      returning: mockInsertValuesConflictSetReturning,
    }),
  });

  // Default: execFile chiama il callback con successo (output Android)
  mockExecFile.mockImplementation(
    (
      _cmd: string,
      _args: string[],
      _opts: unknown,
      cb: (err: null, result: { stdout: string; stderr: string }) => void,
    ) => {
      cb(null, {
        stdout: makeEasOutput("Android update ID", NEW_UPDATE_ID, NEW_GROUP_ID),
        stderr: "",
      });
    },
  );
});

afterEach(() => {
  process.env.EAS_TOKEN = originalEasToken;
});

// ══════════════════════════════════════════════════════════════════════════
// 1. Parser — output con "Android update ID"
// ══════════════════════════════════════════════════════════════════════════
describe("POST /:id/republish — parser output EAS", () => {
  it("estrae updateId e groupId da riga 'Android update ID'", async () => {
    const app = buildApp();
    const res = await request(app).post(`/api/admin/ota/${RELEASE_ID}/republish`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.newRelease).toBeDefined();

    // Verifica che l'insert sia avvenuto con gli ID corretti
    expect(mockInsertValues).toHaveBeenCalledTimes(1);
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        easUpdateId: NEW_UPDATE_ID,
        easGroupId: NEW_GROUP_ID,
      }),
    );
  });

  it("estrae updateId e groupId da riga 'iOS update ID'", async () => {
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: unknown,
        cb: (err: null, result: { stdout: string; stderr: string }) => void,
      ) => {
        cb(null, {
          stdout: makeEasOutput("iOS update ID", NEW_UPDATE_ID, NEW_GROUP_ID),
          stderr: "",
        });
      },
    );

    const app = buildApp();
    const res = await request(app).post(`/api/admin/ota/${RELEASE_ID}/republish`);

    expect(res.status).toBe(200);
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        easUpdateId: NEW_UPDATE_ID,
        easGroupId: NEW_GROUP_ID,
      }),
    );
  });

  it("estrae updateId e groupId da riga 'Update ID' generica", async () => {
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: unknown,
        cb: (err: null, result: { stdout: string; stderr: string }) => void,
      ) => {
        cb(null, {
          stdout: makeEasOutput("Update ID", NEW_UPDATE_ID, NEW_GROUP_ID),
          stderr: "",
        });
      },
    );

    const app = buildApp();
    const res = await request(app).post(`/api/admin/ota/${RELEASE_ID}/republish`);

    expect(res.status).toBe(200);
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        easUpdateId: NEW_UPDATE_ID,
        easGroupId: NEW_GROUP_ID,
      }),
    );
  });

  it("restituisce 500 esplicito se l'output non contiene nessun ID — nessun ID inventato", async () => {
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: unknown,
        cb: (err: null, result: { stdout: string; stderr: string }) => void,
      ) => {
        cb(null, {
          stdout: "Republishing update...\nSomething went wrong, no IDs here.",
          stderr: "",
        });
      },
    );

    const app = buildApp();
    const res = await request(app).post(`/api/admin/ota/${RELEASE_ID}/republish`);

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/parsare/i);
    // Nessun insert deve essere avvenuto
    expect(mockInsertValues).not.toHaveBeenCalled();
  });

  it("restituisce 500 se updateId è presente ma groupId è assente", async () => {
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: unknown,
        cb: (err: null, result: { stdout: string; stderr: string }) => void,
      ) => {
        cb(null, {
          stdout: `Android update ID  ${NEW_UPDATE_ID}\nNo group ID here.`,
          stderr: "",
        });
      },
    );

    const app = buildApp();
    const res = await request(app).post(`/api/admin/ota/${RELEASE_ID}/republish`);

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/parsare/i);
    expect(mockInsertValues).not.toHaveBeenCalled();
  });

  it("restituisce 500 se EAS CLI fallisce (exit non-zero)", async () => {
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: unknown,
        cb: (err: Error & { stderr?: string }, result?: unknown) => void,
      ) => {
        const err = Object.assign(new Error("eas failed"), {
          stderr: "Authentication error: invalid token",
        });
        cb(err);
      },
    );

    const app = buildApp();
    const res = await request(app).post(`/api/admin/ota/${RELEASE_ID}/republish`);

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/fallito/i);
    expect(mockInsertValues).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 2. Guard: easGroupId mancante → 400
// ══════════════════════════════════════════════════════════════════════════
describe("POST /:id/republish — guard easGroupId mancante", () => {
  it("risponde 400 se la release non ha easGroupId", async () => {
    (db.select as ReturnType<typeof vi.fn>).mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockResolvedValue([{ ...BASE_RELEASE, easGroupId: null }]);
      return chain;
    });

    const app = buildApp();
    const res = await request(app).post(`/api/admin/ota/${RELEASE_ID}/republish`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/groupId/i);
    expect(mockExecFile).not.toHaveBeenCalled();
    expect(mockInsertValues).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 3. Guard: EAS_TOKEN assente → 500
// ══════════════════════════════════════════════════════════════════════════
describe("POST /:id/republish — guard EAS_TOKEN assente", () => {
  it("risponde 500 se EAS_TOKEN non è configurato", async () => {
    delete process.env.EAS_TOKEN;

    const app = buildApp();
    const res = await request(app).post(`/api/admin/ota/${RELEASE_ID}/republish`);

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/EAS_TOKEN/i);
    expect(mockExecFile).not.toHaveBeenCalled();
    expect(mockInsertValues).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 4. Guard: release inesistente → 404
// ══════════════════════════════════════════════════════════════════════════
describe("POST /:id/republish — guard release non trovata", () => {
  it("risponde 404 se la release non esiste nel DB", async () => {
    (db.select as ReturnType<typeof vi.fn>).mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.from = vi.fn().mockReturnValue(chain);
      chain.where = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockResolvedValue([]); // nessuna riga
      return chain;
    });

    const app = buildApp();
    const res = await request(app).post(`/api/admin/ota/nonexistent-id/republish`);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/non trovata/i);
    expect(mockExecFile).not.toHaveBeenCalled();
    expect(mockInsertValues).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 5. Verifica: la nuova riga è inserita con status='pending' e channel='production'
// ══════════════════════════════════════════════════════════════════════════
describe("POST /:id/republish — inserimento DB", () => {
  it("inserisce con status='pending' e channel='production'", async () => {
    const app = buildApp();
    const res = await request(app).post(`/api/admin/ota/${RELEASE_ID}/republish`);

    expect(res.status).toBe(200);
    expect(mockInsertValues).toHaveBeenCalledTimes(1);
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "pending",
        channel: "production",
      }),
    );
  });

  it("NON imposta approvedAt né approvedBy (la release è pending, non approvata)", async () => {
    const app = buildApp();
    await request(app).post(`/api/admin/ota/${RELEASE_ID}/republish`);

    const insertArg = (mockInsertValues as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(insertArg.approvedAt).toBeUndefined();
    expect(insertArg.approvedBy).toBeUndefined();
  });

  it("propaga runtimeVersion dalla release originale", async () => {
    const app = buildApp();
    await request(app).post(`/api/admin/ota/${RELEASE_ID}/republish`);

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ runtimeVersion: BASE_RELEASE.runtimeVersion }),
    );
  });
});
