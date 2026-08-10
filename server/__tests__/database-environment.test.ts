import { afterEach, describe, expect, it } from "vitest";
import {
  getDatabaseUrlForRuntime,
  getDeployEnvironment,
  getProductionDatabaseUrl,
} from "../lib/database-environment";

const ENV_KEYS = [
  "BIKERLINK_DEPLOY_ENV",
  "DATABASE_URL",
  "DATABASE_URL_DEV",
  "DATABASE_URL_CANDIDATE",
  "DATABASE_URL_PRODUCTION",
] as const;

const originalEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
);

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("database target selection", () => {
  it("uses only DATABASE_URL_DEV in development", () => {
    process.env.BIKERLINK_DEPLOY_ENV = "development";
    process.env.DATABASE_URL_DEV = "postgres://dev.example/db";
    process.env.DATABASE_URL = "postgres://production.example/db";

    expect(getDeployEnvironment()).toBe("development");
    expect(getDatabaseUrlForRuntime()).toBe("postgres://dev.example/db");
  });

  it("fails closed in staging when the candidate target is missing", () => {
    process.env.BIKERLINK_DEPLOY_ENV = "staging";
    process.env.DATABASE_URL = "postgres://production.example/db";
    delete process.env.DATABASE_URL_CANDIDATE;

    expect(() => getDatabaseUrlForRuntime()).toThrow("DATABASE_URL_CANDIDATE");
  });

  it("uses only DATABASE_URL_PRODUCTION in production", () => {
    process.env.BIKERLINK_DEPLOY_ENV = "production";
    process.env.DATABASE_URL_PRODUCTION = "postgres://production.example/db";
    process.env.DATABASE_URL = "postgres://wrong.example/db";

    expect(getDatabaseUrlForRuntime()).toBe("postgres://production.example/db");
    expect(getProductionDatabaseUrl()).toBe("postgres://production.example/db");
  });

  it("does not allow the production-only helper from development", () => {
    process.env.BIKERLINK_DEPLOY_ENV = "development";
    process.env.DATABASE_URL_DEV = "postgres://dev.example/db";

    expect(() => getProductionDatabaseUrl()).toThrow("esclusivamente in production");
  });
});
