/**
 * Verifica la classificazione riavvio voluto vs crash del backend.
 *
 * Unità sotto test: server/uptime.ts
 *  - initUptimeTracking() legge lo state file e classifica il boot come
 *    cold_start (nessuno state file), restart (cleanShutdown=true) o
 *    crash (cleanShutdown=false oppure campo assente nei dati legacy).
 *  - markCleanShutdown() marca lo state file come spegnimento pulito così che
 *    il boot successivo sia classificato come riavvio intenzionale.
 *
 * Isolamento I/O:
 *  - lo state file vive in `<cwd>/logs/backend-uptime-state.json`. I path sono
 *    calcolati al load del modulo da process.cwd(); facciamo chdir su una
 *    directory temporanea prima di importare il modulo, e ripuliamo lo state
 *    file tra un test e l'altro.
 *  - `../db` e `@shared/db` sono mockati per evitare il pool PG; le insert su
 *    serverRestarts sono catturate da `insertValuesMock`.
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const { insertValuesMock } = vi.hoisted(() => ({
  insertValuesMock: vi.fn(),
}));

vi.mock("../db", () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: (...args: unknown[]) => {
        insertValuesMock(...args);
        // initUptimeTracking fa `.catch(...)` sul risultato → serve una Promise.
        return Promise.resolve();
      },
    }),
  },
}));

vi.mock("@shared/db", () => ({
  serverRestarts: {},
}));

let tmpDir: string;
let originalCwd: string;
let stateFile: string;

beforeAll(() => {
  originalCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "uptime-test-"));
  process.chdir(tmpDir);
  stateFile = path.join(tmpDir, "logs", "backend-uptime-state.json");
});

afterAll(() => {
  process.chdir(originalCwd);
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup */
  }
});

beforeEach(() => {
  insertValuesMock.mockClear();
  // Stato pulito: niente logs dir → il modulo la ricrea al bisogno.
  fs.rmSync(path.join(tmpDir, "logs"), { recursive: true, force: true });
  // Ogni test re-importa uptime.ts per ottenere un nuovo SERVER_START_TIME e
  // ri-applicare i mock dopo resetModules.
  vi.resetModules();
});

function writeStateFile(state: Record<string, unknown>): void {
  fs.mkdirSync(path.join(tmpDir, "logs"), { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(state), "utf-8");
}

function readStateFile(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(stateFile, "utf-8"));
}

async function importUptime() {
  return await import("../uptime");
}

describe("initUptimeTracking — classificazione del boot", () => {
  it("cold start: nessuno state file → reason 'cold_start'", async () => {
    expect(fs.existsSync(stateFile)).toBe(false);

    const { initUptimeTracking } = await importUptime();
    initUptimeTracking();

    expect(insertValuesMock).toHaveBeenCalledTimes(1);
    expect(insertValuesMock.mock.calls[0][0]).toMatchObject({
      reason: "cold_start",
    });
  });

  it("riavvio intenzionale: state con cleanShutdown=true → reason 'restart'", async () => {
    writeStateFile({ startedAt: Date.now() - 60_000, cleanShutdown: true });

    const { initUptimeTracking } = await importUptime();
    initUptimeTracking();

    expect(insertValuesMock).toHaveBeenCalledTimes(1);
    expect(insertValuesMock.mock.calls[0][0]).toMatchObject({
      reason: "restart",
    });
  });

  it("crash: state con cleanShutdown=false → reason 'crash'", async () => {
    writeStateFile({ startedAt: Date.now() - 60_000, cleanShutdown: false });

    const { initUptimeTracking } = await importUptime();
    initUptimeTracking();

    expect(insertValuesMock).toHaveBeenCalledTimes(1);
    expect(insertValuesMock.mock.calls[0][0]).toMatchObject({
      reason: "crash",
    });
  });

  it("crash legacy: state senza campo cleanShutdown → reason 'crash'", async () => {
    writeStateFile({ startedAt: Date.now() - 60_000 });

    const { initUptimeTracking } = await importUptime();
    initUptimeTracking();

    expect(insertValuesMock).toHaveBeenCalledTimes(1);
    expect(insertValuesMock.mock.calls[0][0]).toMatchObject({
      reason: "crash",
    });
  });

  it("state file corrotto (JSON invalido) → trattato come cold start", async () => {
    fs.mkdirSync(path.join(tmpDir, "logs"), { recursive: true });
    fs.writeFileSync(stateFile, "{ this is not valid json", "utf-8");

    const { initUptimeTracking } = await importUptime();
    initUptimeTracking();

    expect(insertValuesMock.mock.calls[0][0]).toMatchObject({
      reason: "cold_start",
    });
  });

  it("state file senza startedAt numerico → trattato come cold start", async () => {
    writeStateFile({ cleanShutdown: true });

    const { initUptimeTracking } = await importUptime();
    initUptimeTracking();

    expect(insertValuesMock.mock.calls[0][0]).toMatchObject({
      reason: "cold_start",
    });
  });

  it("resetta il marker: dopo il boot lo state ha cleanShutdown=false", async () => {
    writeStateFile({ startedAt: Date.now() - 60_000, cleanShutdown: true });

    const { initUptimeTracking } = await importUptime();
    initUptimeTracking();

    const state = readStateFile();
    expect(state.cleanShutdown).toBe(false);
    expect(typeof state.startedAt).toBe("number");
  });
});

describe("markCleanShutdown — marker di spegnimento pulito", () => {
  it("dopo il boot, marcare clean shutdown rende il boot successivo un 'restart'", async () => {
    // Primo boot: cold start → scrive cleanShutdown=false.
    const { initUptimeTracking, markCleanShutdown } = await importUptime();
    initUptimeTracking();
    expect(readStateFile().cleanShutdown).toBe(false);

    // gracefulShutdown marca lo state come pulito.
    markCleanShutdown();
    expect(readStateFile().cleanShutdown).toBe(true);
    expect(typeof readStateFile().startedAt).toBe("number");

    // Boot successivo: lo state esistente con cleanShutdown=true → 'restart'.
    insertValuesMock.mockClear();
    vi.resetModules();
    const next = await importUptime();
    next.initUptimeTracking();
    expect(insertValuesMock.mock.calls[0][0]).toMatchObject({
      reason: "restart",
    });
  });

  it("senza state file, markCleanShutdown è un no-op e non crea il file", async () => {
    expect(fs.existsSync(stateFile)).toBe(false);

    const { markCleanShutdown } = await importUptime();
    markCleanShutdown();

    expect(fs.existsSync(stateFile)).toBe(false);
  });
});
