import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../storage", () => ({}));

import { httpProbe } from "../routes/admin/thinkcentre-health-utils";

function stubFetch(status: number): void {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => "",
  })));
}

describe("httpProbe status contract", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([200, 201, 204])("accepts HTTP %i as online", async (status) => {
    stubFetch(status);
    const result = await httpProbe("https://example.test/health");
    expect(result.ok).toBe(true);
  });

  it.each([401, 403, 500])("rejects HTTP %i as offline", async (status) => {
    stubFetch(status);
    const result = await httpProbe("https://example.test/health");
    expect(result.ok).toBe(false);
  });
});
