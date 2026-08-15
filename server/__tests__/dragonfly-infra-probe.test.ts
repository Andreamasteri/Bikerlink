import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockPing = vi.fn<[], Promise<string>>();
const mockQuit = vi.fn<[], Promise<"OK">>();

vi.mock("ioredis", () => {
  const RedisMock = vi.fn(function () {
    return { ping: mockPing, quit: mockQuit };
  });
  return { default: RedisMock };
});

vi.spyOn(console, "error").mockImplementation(() => {});

import { probeDragonflyInfra } from "../routes/admin/thinkcentre-health-infra-probes";
import Redis from "ioredis";
const MockRedis = Redis as unknown as ReturnType<typeof vi.fn>;

const REDIS_URL = "redis://vps.internal:6380";

beforeEach(() => {
  vi.clearAllMocks();
  mockQuit.mockResolvedValue("OK");
  delete process.env.REDIS_URL;
});

afterEach(() => {
  delete process.env.REDIS_URL;
});

describe("probeDragonflyInfra — VPS REDIS_URL", () => {
  it("returns ok=true when the VPS PING succeeds", async () => {
    process.env.REDIS_URL = REDIS_URL;
    mockPing.mockResolvedValue("PONG");

    const result = await probeDragonflyInfra();

    expect(result.configured).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.latencyMs).toBeTypeOf("number");
    expect(MockRedis).toHaveBeenCalledTimes(1);
    expect(mockPing).toHaveBeenCalledTimes(1);
    expect(mockQuit).toHaveBeenCalledTimes(1);
  });

  it("returns ok=false when the VPS PING fails", async () => {
    process.env.REDIS_URL = REDIS_URL;
    mockPing.mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await probeDragonflyInfra();

    expect(result.configured).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/ECONNREFUSED/i);
    expect(mockQuit).toHaveBeenCalledTimes(1);
  });

  it("masks the Redis password in the returned URL", async () => {
    process.env.REDIS_URL = "redis://:secret-password@vps.internal:6380";
    mockPing.mockResolvedValue("PONG");

    const result = await probeDragonflyInfra();

    expect(result.url).not.toContain("secret-password");
  });

  it("does not fall back to ThinkCentre probe variables", async () => {
    process.env.REDIS_PROBE_URL = "https://tc.example.invalid/probe/redis";

    const result = await probeDragonflyInfra();

    expect(result.configured).toBe(false);
    expect(result.ok).toBe(false);
    expect(MockRedis).not.toHaveBeenCalled();
  });

  it("returns configured=false when REDIS_URL is absent", async () => {
    const result = await probeDragonflyInfra();

    expect(result.configured).toBe(false);
    expect(result.ok).toBe(false);
    expect(result.latencyMs).toBeNull();
    expect(result.url).toBeNull();
    expect(MockRedis).not.toHaveBeenCalled();
  });
});
