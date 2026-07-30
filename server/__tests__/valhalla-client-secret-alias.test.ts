import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

describe("Valhalla Cloudflare secret compatibility", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.VALHALLA_URL = "https://valhalla.test.local";
    delete process.env.VALHALLA_API_KEY;
    process.env.VALHALLA_TOKEN = "legacy-valhalla-token";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...ORIGINAL_ENV };
  });

  it("uses VALHALLA_TOKEN when the canonical API-key name is absent", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ version: "3.5.1" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { getInfo } = await import("../routing/valhalla-client");
    await expect(getInfo()).resolves.toMatchObject({ status: "ok" });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["X-Valhalla-Key"]).toBe(
      "legacy-valhalla-token",
    );
  });
});
