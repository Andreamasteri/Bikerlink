import { describe, expect, it } from "vitest";
import { validateMigrationFiles } from "../scripts/check-migration-prefix-duplicates";

describe("check-migration-prefix-duplicates", () => {
  it("accepts the exact allowlisted 0157 group", () => {
    expect(() =>
      validateMigrationFiles([
        "0156_ride_telemetry_user_session_indexes.sql",
        "0157_fixed_couples.sql",
        "0157_watchdog_log_event_key.sql",
      ]),
    ).not.toThrow();
  });

  it("accepts the valid single 0157 migration in the merge ref", () => {
    expect(() =>
      validateMigrationFiles(["0157_fixed_couples.sql"]),
    ).not.toThrow();
  });

  it("accepts a tree without duplicate prefixes", () => {
    expect(() => validateMigrationFiles([])).not.toThrow();
  });
});
