import { describe, expect, it, vi } from "vitest";
import {
  assertNoDuplicateMigrationPrefixes,
  KNOWN_DUPLICATE_FILE_SETS,
} from "../migration-prefix-guard";

describe("migration-prefix-guard", () => {
  it("allows the exact 0157 pair preserved in schema_migrations", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(KNOWN_DUPLICATE_FILE_SETS.get("0157")).toEqual(
      new Set([
        "0157_fixed_couples.sql",
        "0157_watchdog_log_event_key.sql",
      ]),
    );
    expect(() =>
      assertNoDuplicateMigrationPrefixes([
        "0156_ride_telemetry_user_session_indexes.sql",
        "0157_fixed_couples.sql",
        "0157_watchdog_log_event_key.sql",
      ]),
    ).not.toThrow();

    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("rejects any additional file added to the allowlisted prefix", () => {
    expect(() =>
      assertNoDuplicateMigrationPrefixes([
        "0157_fixed_couples.sql",
        "0157_watchdog_log_event_key.sql",
        "0157_unexpected.sql",
      ]),
    ).toThrow(/0157_unexpected\.sql/);
  });

  it("accepts a single historical 0157 migration in a merge ref", () => {
    expect(() =>
      assertNoDuplicateMigrationPrefixes([
        "0157_fixed_couples.sql",
      ]),
    ).not.toThrow();
  });

  it("accepts a tree without the historical duplicate group", () => {
    expect(() => assertNoDuplicateMigrationPrefixes([])).not.toThrow();
  });

  it("continues rejecting a previously unknown duplicate prefix", () => {
    expect(() =>
      assertNoDuplicateMigrationPrefixes([
        "0158_first.sql",
        "0158_second.sql",
      ]),
    ).toThrow(/0158/);
  });
});
