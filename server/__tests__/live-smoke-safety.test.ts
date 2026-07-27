import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const read = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

describe("live smoke safety contract", () => {
  it("uses a local-only server without the mutating production boot", () => {
    const source = read("scripts/smoke/live-smoke-server.ts");

    expect(source).toContain('const HOST = "127.0.0.1"');
    expect(source).toContain("createTableIfMissing: false");
    expect(source).toContain('LIVE_SMOKE_ACK !== "I_UNDERSTAND_SMOKE_WRITES"');
    expect(source).not.toMatch(/\brunBootSequence\b/);
    expect(source).not.toMatch(/\brunMigrations\b/);
    expect(source).not.toMatch(/\bregisterAllRoutes\b/);
  });

  it("keeps production smoke identities blocked unless the local app flag is set", () => {
    const source = read("server/routes/auth/register.ts");

    expect(source).toContain("req.app.locals.controlledSmokeRegistration === true");
    expect(source).toContain("if (isSmokeIdentity && !controlledSmoke)");
    expect(source).toContain("if (!controlledSmoke)");
  });

  it("makes exact per-run cleanup part of the smoke result", () => {
    const main = read("scripts/smoke/run-smoke.ts");
    const part2 = read("scripts/smoke/run-smoke.part2.ts");
    const orphanCleanup = read("scripts/smoke/cleanup-orphans-runtime.ts");

    expect(main).toContain("DELETE FROM users WHERE id = $1");
    expect(main).toContain("remaining.rowCount === 0");
    expect(part2).toContain("return cleanupFailed ? 1 : exitCode");
    expect(orphanCleanup).toContain('process.env.SMOKE_CLEANUP_ORPHANS !== "1"');
  });
});
