import { describe, expect, it, afterEach } from "vitest";
import { getBullConnectionOptions } from "../cache/redis";

afterEach(() => {
  delete process.env.REDIS_URL;
  delete process.env.TC_DRAGONFLY_URL;
});

describe("Redis provider selection", () => {
  it("prefers REDIS_URL over the retired ThinkCentre variable", () => {
    process.env.REDIS_URL = "rediss://:vps-secret@redis.example.test:6380";
    process.env.TC_DRAGONFLY_URL = "redis://:tc-secret@127.0.0.1:16379";

    const options = getBullConnectionOptions();

    expect(options?.host).toBe("redis.example.test");
    expect(options?.port).toBe(6380);
    expect(options?.password).toBe("vps-secret");
    expect(options?.tls).toEqual({});
    expect(options?.retryStrategy).toBeTypeOf("function");
  });

  it("keeps TC_DRAGONFLY_URL only as a legacy fallback", () => {
    process.env.TC_DRAGONFLY_URL = "redis://:tc-secret@127.0.0.1:16379";

    const options = getBullConnectionOptions();

    expect(options?.host).toBe("127.0.0.1");
    expect(options?.port).toBe(16379);
    expect(options?.password).toBe("tc-secret");
  });

  it("returns null when neither provider URL is configured", () => {
    expect(getBullConnectionOptions()).toBeNull();
  });
});
