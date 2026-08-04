import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";

vi.mock("../db", () => ({
  pool: {
    connect: vi.fn(),
  },
}));

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    default: {
      ...(actual as unknown as { default?: typeof actual }).default,
      ...actual,
    },
    existsSync: vi.fn(actual.existsSync),
    readdirSync: vi.fn(actual.readdirSync),
    readFileSync: vi.fn(actual.readFileSync),
    writeFileSync: vi.fn(actual.writeFileSync),
    mkdirSync: vi.fn(actual.mkdirSync),
  };
});

import { isPostgisOwnerError, isNoTransactionMigration, splitStatements, applyMigration, applyMigrationNoTransaction, runMigrations } from "../migrate";
import { pool } from "../db";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDbError(code: string, message: string): Error & { code: string } {
  const err = new Error(message) as Error & { code: string };
  err.code = code;
  return err;
}

function makeMockClient() {
  const queries: string[] = [];
  const client = {
    query: vi.fn(async (sql: string) => {
      const trimmed = typeof sql === "string" ? sql.trim() : sql;
      queries.push(trimmed);
      // Default: a plain INSERT into schema_migrations succeeds and inserts
      // exactly one row (rowCount:1). Tests that need to simulate a
      // concurrent process winning the race override this per-test.
      if (typeof trimmed === "string" && trimmed.startsWith("INSERT INTO schema_migrations")) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [] };
    }),
    release: vi.fn(),
    _queries: queries,
  };
  return client;
}

// ---------------------------------------------------------------------------
// Unit tests — isPostgisOwnerError
// ---------------------------------------------------------------------------

describe("isPostgisOwnerError", () => {
  describe("returns true for 42501 errors on PostGIS system tables", () => {
    it("spatial_ref_sys", () => {
      const err = makeDbError(
        "42501",
        'must be owner of table spatial_ref_sys'
      );
      expect(isPostgisOwnerError(err)).toBe(true);
    });

    it("geography_columns", () => {
      const err = makeDbError(
        "42501",
        'permission denied for table geography_columns'
      );
      expect(isPostgisOwnerError(err)).toBe(true);
    });

    it("geometry_columns", () => {
      const err = makeDbError(
        "42501",
        'must be owner of view geometry_columns'
      );
      expect(isPostgisOwnerError(err)).toBe(true);
    });
  });

  describe("returns false for 42501 errors on non-PostGIS tables", () => {
    it("app table 'users'", () => {
      const err = makeDbError(
        "42501",
        'permission denied for table users'
      );
      expect(isPostgisOwnerError(err)).toBe(false);
    });

    it("app table 'rides'", () => {
      const err = makeDbError(
        "42501",
        'permission denied for table rides'
      );
      expect(isPostgisOwnerError(err)).toBe(false);
    });
  });

  describe("returns false for non-42501 error codes", () => {
    it("42P07 (duplicate_table) mentioning spatial_ref_sys", () => {
      const err = makeDbError(
        "42P07",
        'relation "spatial_ref_sys" already exists'
      );
      expect(isPostgisOwnerError(err)).toBe(false);
    });

    it("42701 (duplicate_column)", () => {
      const err = makeDbError("42701", "column already exists");
      expect(isPostgisOwnerError(err)).toBe(false);
    });

    it("non-Error object with code 42501 and matching text", () => {
      const err = { code: "42501", toString: () => "spatial_ref_sys" };
      expect(isPostgisOwnerError(err)).toBe(true);
    });

    it("null", () => {
      expect(isPostgisOwnerError(null)).toBe(false);
    });

    it("undefined", () => {
      expect(isPostgisOwnerError(undefined)).toBe(false);
    });

    it("plain string", () => {
      expect(isPostgisOwnerError("42501")).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Unit tests — isNoTransactionMigration
// ---------------------------------------------------------------------------

describe("isNoTransactionMigration", () => {
  it("returns true when pragma is present at the top", () => {
    const sql = "-- migrate:no-transaction\nCREATE INDEX CONCURRENTLY IF NOT EXISTS idx ON t(c);";
    expect(isNoTransactionMigration(sql)).toBe(true);
  });

  it("returns true regardless of whitespace around the colon", () => {
    const sql = "--  migrate:no-transaction\nCREATE TABLE t (id INT);";
    expect(isNoTransactionMigration(sql)).toBe(true);
  });

  it("returns true when pragma is mixed-case", () => {
    const sql = "-- MIGRATE:NO-TRANSACTION\nCREATE INDEX CONCURRENTLY idx ON t(c);";
    expect(isNoTransactionMigration(sql)).toBe(true);
  });

  it("returns false when pragma is absent", () => {
    const sql = "-- Normal migration\nCREATE INDEX IF NOT EXISTS idx ON t(c);";
    expect(isNoTransactionMigration(sql)).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(isNoTransactionMigration("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Regression test — 0152 concurrent reconciliation statement boundaries
// ---------------------------------------------------------------------------

describe("0152 reconciliation migration boundaries", () => {
  it("keeps every concurrent DDL command isolated for autocommit execution", () => {
    const migrationPath = path.resolve(
      process.cwd(),
      "migrations",
      "0152_reconcile_dev_indexes_and_constraints.sql"
    );
    const sql = fs.readFileSync(migrationPath, "utf-8");
    const statements = splitStatements(sql);

    expect(isNoTransactionMigration(sql)).toBe(true);
    expect(statements).toHaveLength(45);
    expect(statements.filter((statement) =>
      /CREATE (?:UNIQUE )?INDEX CONCURRENTLY/.test(statement)
    )).toHaveLength(42);
    expect(statements.filter((statement) => statement.includes("DO $"))).toHaveLength(2);
    expect(statements.every((statement) =>
      (statement.match(/CREATE (?:UNIQUE )?INDEX CONCURRENTLY/g) ?? []).length <= 1
    )).toBe(true);
  });

  it("isolates every 0155 statement so CREATE INDEX CONCURRENTLY is autocommit-safe", () => {
    const migrationPath = path.resolve(
      process.cwd(),
      "migrations",
      "0155_temp_spill_indexes_and_watchdog_identity.sql"
    );
    const sql = fs.readFileSync(migrationPath, "utf-8");
    const statements = splitStatements(sql);

    expect(isNoTransactionMigration(sql)).toBe(true);
    expect(statements).toHaveLength(9);
    expect(statements.filter((statement) =>
      /CREATE (?:UNIQUE )?INDEX CONCURRENTLY/.test(statement)
    )).toHaveLength(6);
    expect(statements.every((statement) =>
      (statement.match(/CREATE (?:UNIQUE )?INDEX CONCURRENTLY/g) ?? []).length <= 1
    )).toBe(true);
    expect(statements.some((statement) =>
      statement.includes("ALTER TABLE ai_watchdog_log ALTER COLUMN event_key SET NOT NULL;") &&
      statement.includes("CREATE INDEX CONCURRENTLY")
    )).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Integration tests — applyMigrationNoTransaction
// ---------------------------------------------------------------------------

describe("applyMigrationNoTransaction", () => {
  let client: ReturnType<typeof makeMockClient>;

  beforeEach(() => {
    client = makeMockClient();
  });

  it("runs statements without BEGIN/COMMIT and records migration", async () => {
    const statements = [
      "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_brand ON app_crash_logs USING gin (device_brand gin_trgm_ops)",
    ];

    await expect(
      applyMigrationNoTransaction(client as never, "0087_test.sql", statements)
    ).resolves.toBeUndefined();

    const hasBegin = client._queries.some((q) => q === "BEGIN");
    const hasCommit = client._queries.some((q) => q === "COMMIT");
    expect(hasBegin).toBe(false);
    expect(hasCommit).toBe(false);

    const recorded = client._queries.some((q) =>
      q.startsWith("INSERT INTO schema_migrations")
    );
    expect(recorded).toBe(true);
  });

  it("skips duplicate-object errors (42710) without throwing", async () => {
    const dupErr = makeDbError("42710", 'index "idx_brand" already exists');

    client.query.mockImplementation(async (sql: string) => {
      const trimmed = typeof sql === "string" ? sql.trim() : sql;
      client._queries.push(trimmed);
      if (trimmed.startsWith("CREATE INDEX CONCURRENTLY")) throw dupErr;
      return { rows: [] };
    });

    const statements = [
      "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_brand ON t USING gin (c gin_trgm_ops)",
    ];

    await expect(
      applyMigrationNoTransaction(client as never, "0087_test.sql", statements)
    ).resolves.toBeUndefined();

    const recorded = client._queries.some((q) =>
      q.startsWith("INSERT INTO schema_migrations")
    );
    expect(recorded).toBe(true);
  });

  it("throws on non-skippable errors without recording the migration", async () => {
    const fatalErr = makeDbError("XX000", "unexpected internal error");

    client.query.mockImplementation(async (sql: string) => {
      const trimmed = typeof sql === "string" ? sql.trim() : sql;
      client._queries.push(trimmed);
      if (trimmed.startsWith("CREATE INDEX CONCURRENTLY")) throw fatalErr;
      return { rows: [] };
    });

    const statements = [
      "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_brand ON t USING gin (c gin_trgm_ops)",
    ];

    await expect(
      applyMigrationNoTransaction(client as never, "0087_test.sql", statements)
    ).rejects.toThrow(/0087_test\.sql.*failed/i);

    const recorded = client._queries.some((q) =>
      q.startsWith("INSERT INTO schema_migrations")
    );
    expect(recorded).toBe(false);
  });

  it("does not throw when the insert is a no-op (ON CONFLICT DO NOTHING, rowCount 0) — already applied concurrently", async () => {
    client.query.mockImplementation(async (sql: string) => {
      const trimmed = typeof sql === "string" ? sql.trim() : sql;
      client._queries.push(trimmed);
      if (trimmed.startsWith("INSERT INTO schema_migrations")) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [] };
    });

    const statements = ["CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_x ON t(c)"];

    await expect(
      applyMigrationNoTransaction(client as never, "0088_test.sql", statements)
    ).resolves.toBeUndefined();

    const usedOnConflict = client._queries.some((q) =>
      q.includes("ON CONFLICT (filename) DO NOTHING")
    );
    expect(usedOnConflict).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Integration test — migration runner skips 42501 on PostGIS system tables
// ---------------------------------------------------------------------------

describe("applyMigration — PostGIS 42501 guard", () => {
  let client: ReturnType<typeof makeMockClient>;

  beforeEach(() => {
    client = makeMockClient();
  });

  it("completes successfully when a statement fails with 42501 on spatial_ref_sys", async () => {
    const postgisErr = makeDbError(
      "42501",
      "must be owner of table spatial_ref_sys"
    );

    let statementCallCount = 0;
    client.query.mockImplementation(async (sql: string) => {
      const trimmed = typeof sql === "string" ? sql.trim() : sql;
      client._queries.push(trimmed);

      if (trimmed === "ALTER TABLE spatial_ref_sys ADD PRIMARY KEY (srid)") {
        statementCallCount++;
        throw postgisErr;
      }
      return { rows: [] };
    });

    const statements = [
      "CREATE EXTENSION IF NOT EXISTS postgis",
      "ALTER TABLE spatial_ref_sys ADD PRIMARY KEY (srid)",
      "CREATE TABLE IF NOT EXISTS rides (id SERIAL PRIMARY KEY)",
    ];

    await expect(
      applyMigration(client as never, "0001_postgis_setup.sql", statements)
    ).resolves.toBeUndefined();

    expect(statementCallCount).toBe(1);

    const committed = client._queries.some((q) => q === "COMMIT");
    expect(committed).toBe(true);
  });

  it("throws when a statement fails with 42501 on an application table", async () => {
    const appErr = makeDbError(
      "42501",
      "permission denied for table rides"
    );

    client.query.mockImplementation(async (sql: string) => {
      const trimmed = typeof sql === "string" ? sql.trim() : sql;
      client._queries.push(trimmed);

      if (trimmed === "ALTER TABLE rides ADD COLUMN speed INTEGER") {
        throw appErr;
      }
      return { rows: [] };
    });

    const statements = ["ALTER TABLE rides ADD COLUMN speed INTEGER"];

    await expect(
      applyMigration(client as never, "0002_add_speed.sql", statements)
    ).rejects.toThrow(/0002_add_speed\.sql.*failed/i);

    const rolledBack = client._queries.some((q) => q === "ROLLBACK");
    expect(rolledBack).toBe(true);
  });

  it("completes when all statements succeed (no errors)", async () => {
    const statements = [
      "CREATE TABLE IF NOT EXISTS test_table (id SERIAL PRIMARY KEY)",
      "CREATE INDEX IF NOT EXISTS idx_test ON test_table(id)",
    ];

    await expect(
      applyMigration(client as never, "0003_test.sql", statements)
    ).resolves.toBeUndefined();

    const committed = client._queries.some((q) => q === "COMMIT");
    expect(committed).toBe(true);
  });

  it("does not throw when the insert is a no-op (ON CONFLICT DO NOTHING, rowCount 0) — already applied concurrently", async () => {
    client.query.mockImplementation(async (sql: string) => {
      const trimmed = typeof sql === "string" ? sql.trim() : sql;
      client._queries.push(trimmed);
      if (trimmed.startsWith("INSERT INTO schema_migrations")) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [] };
    });

    const statements = ["CREATE TABLE IF NOT EXISTS test_table (id SERIAL PRIMARY KEY)"];

    await expect(
      applyMigration(client as never, "0004_test.sql", statements)
    ).resolves.toBeUndefined();

    const usedOnConflict = client._queries.some((q) =>
      q.includes("ON CONFLICT (filename) DO NOTHING")
    );
    expect(usedOnConflict).toBe(true);

    const committed = client._queries.some((q) => q === "COMMIT");
    expect(committed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Concurrency test — runMigrations() advisory lock (Task #5314)
//
// Simulates two overlapping boot processes calling runMigrations() against
// the same pending migration file. Before the fix, both instances would try
// to apply and INSERT the same filename, and the loser's INSERT would throw
// a duplicate-key error treated as FATAL. With the advisory lock in place,
// the second process blocks until the first releases the lock, re-checks
// schema_migrations, sees the file already applied, and returns cleanly —
// neither instance throws and the migration SQL runs exactly once.
// ---------------------------------------------------------------------------

describe("runMigrations — concurrent boot processes racing the same migration", () => {
  const TEST_FILENAME = "9999_test_concurrent_migration.sql";

  function createSharedDbState() {
    return {
      appliedMigrations: new Set<string>(),
      lockHeld: false,
      lockWaiters: [] as Array<() => void>,
      ddlRunCount: 0,
      insertRunCount: 0,
    };
  }

  function createFakeClient(state: ReturnType<typeof createSharedDbState>) {
    return {
      query: vi.fn(async (sqlText: string, params?: unknown[]) => {
        const trimmed = typeof sqlText === "string" ? sqlText.trim() : sqlText;

        if (trimmed.startsWith("SET statement_timeout") || trimmed.startsWith("RESET statement_timeout")) {
          return { rows: [] };
        }
        if (trimmed.startsWith("CREATE TABLE IF NOT EXISTS schema_migrations")) {
          return { rows: [] };
        }
        if (trimmed.startsWith("SELECT filename FROM schema_migrations")) {
          return { rows: Array.from(state.appliedMigrations).map((filename) => ({ filename })) };
        }
        if (trimmed.startsWith("SELECT pg_advisory_lock")) {
          if (!state.lockHeld) {
            state.lockHeld = true;
            return { rows: [] };
          }
          await new Promise<void>((resolve) => state.lockWaiters.push(resolve));
          state.lockHeld = true;
          return { rows: [] };
        }
        if (trimmed.startsWith("SELECT pg_advisory_unlock")) {
          state.lockHeld = false;
          const next = state.lockWaiters.shift();
          if (next) next();
          return { rows: [] };
        }
        if (trimmed === "BEGIN" || trimmed === "COMMIT" || trimmed === "ROLLBACK") {
          return { rows: [] };
        }
        if (
          trimmed.startsWith("SAVEPOINT") ||
          trimmed.startsWith("RELEASE SAVEPOINT") ||
          trimmed.startsWith("ROLLBACK TO SAVEPOINT")
        ) {
          return { rows: [] };
        }
        if (trimmed.startsWith("INSERT INTO schema_migrations")) {
          const filename = params?.[0] as string;
          if (state.appliedMigrations.has(filename)) {
            return { rows: [], rowCount: 0 };
          }
          state.appliedMigrations.add(filename);
          state.insertRunCount++;
          return { rows: [], rowCount: 1 };
        }
        // Any other statement is treated as the migration's own DDL.
        state.ddlRunCount++;
        return { rows: [] };
      }),
      release: vi.fn(),
    };
  }

  it("serializes two concurrent runMigrations() calls: only one applies the SQL, neither crashes", async () => {
    const state = createSharedDbState();

    vi.mocked(fs.existsSync).mockImplementation((p: unknown) => {
      if (typeof p === "string" && p.includes(".migrations-hash")) return false;
      return true;
    });
    vi.mocked(fs.readdirSync).mockReturnValue([TEST_FILENAME] as never);
    vi.mocked(fs.readFileSync).mockImplementation((p: unknown) => {
      if (typeof p === "string" && p.includes(TEST_FILENAME)) {
        return "CREATE TABLE IF NOT EXISTS test_concurrent_migration_table (id int);";
      }
      return "";
    });
    vi.mocked(fs.writeFileSync).mockImplementation(() => undefined as never);
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined as never);

    (pool.connect as ReturnType<typeof vi.fn>).mockImplementation(async () => createFakeClient(state));

    await expect(Promise.all([runMigrations(), runMigrations()])).resolves.toBeDefined();

    expect(state.appliedMigrations.has(TEST_FILENAME)).toBe(true);
    expect(state.insertRunCount).toBe(1);
    expect(state.ddlRunCount).toBe(1);

    vi.restoreAllMocks();
  });
});
