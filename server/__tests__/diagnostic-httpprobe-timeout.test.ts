import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — refs shared between vi.mock factory and test body.
//
// Design: capturedOptions records every options object passed to http.request.
// The mock response emits "end" immediately so the Promise resolves, letting
// the check function complete without real network I/O.
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => {
  const capturedOptions: Record<string, unknown>[] = [];

  const requestMock = vi.fn((options: Record<string, unknown>, cb: (res: unknown) => void) => {
    capturedOptions.push({ ...options });

    // Minimal mock of the IncomingMessage interface used by httpProbe:
    //   res.statusCode, res.resume(), res.on("end", fn)
    let endHandler: (() => void) | null = null;
    const mockRes = {
      statusCode: 200,
      resume: vi.fn(),
      on: vi.fn((event: string, fn: () => void) => {
        if (event === "end") endHandler = fn;
      }),
    };

    // Minimal mock of ClientRequest: .on(), .end()
    const mockReq = {
      on: vi.fn(),
      end: vi.fn(() => {
        cb(mockRes);
        // Resolve the response immediately after end() is called.
        if (endHandler) endHandler();
      }),
      destroy: vi.fn(),
    };

    return mockReq;
  });

  return { capturedOptions, requestMock };
});

vi.mock("http", () => ({
  default: { request: mocks.requestMock },
  request: mocks.requestMock,
}));

// db and internal-token are required by the module even though httpProbe
// checks don't use them directly.
vi.mock("../db", () => ({
  db: {
    transaction: vi.fn(async (fn: (tx: { execute: (q: unknown) => Promise<unknown> }) => Promise<unknown>) => {
      const mockTx = { execute: vi.fn(async () => ({ rows: [{ cnt: "0" }] })) };
      return fn(mockTx);
    }),
  },
}));

vi.mock("../ai/watchdog/internal-token", () => ({
  getInternalProbeToken: vi.fn(() => "test-token"),
  getInternalProbeHeaderName: vi.fn(() => "x-internal-probe"),
}));

import { checkRoadHazards, checkOta } from "../ai/pipeline-monitor/checks/misc";

// ---------------------------------------------------------------------------
// Reset per-test
// ---------------------------------------------------------------------------
beforeEach(() => {
  mocks.capturedOptions.length = 0;
  mocks.requestMock.mockClear();
});

// ---------------------------------------------------------------------------
// Contract — httpProbe passes timeout: 8000 to http.request
// ---------------------------------------------------------------------------
describe("httpProbe — timeout wall-clock option", () => {
  it("checkRoadHazards chiama http.request con timeout: 8000", async () => {
    await checkRoadHazards();

    expect(mocks.requestMock).toHaveBeenCalled();
    expect(mocks.capturedOptions.length).toBeGreaterThan(0);

    for (let i = 0; i < mocks.capturedOptions.length; i++) {
      expect(
        mocks.capturedOptions[i].timeout,
        `http.request call[${i}] deve avere timeout: 8000`,
      ).toBe(8_000);
    }
  });

  it("checkOta chiama http.request con timeout: 8000", async () => {
    await checkOta();

    expect(mocks.requestMock).toHaveBeenCalled();
    expect(mocks.capturedOptions.length).toBeGreaterThan(0);

    for (let i = 0; i < mocks.capturedOptions.length; i++) {
      expect(
        mocks.capturedOptions[i].timeout,
        `http.request call[${i}] deve avere timeout: 8000`,
      ).toBe(8_000);
    }
  });
});

// ---------------------------------------------------------------------------
// Regression guard — fails if timeout is removed or changed
// ---------------------------------------------------------------------------
describe("httpProbe — regression guard (rimozione o cambio timeout)", () => {
  it("checkRoadHazards: timeout NON è undefined (rimosso)", async () => {
    await checkRoadHazards();

    for (const opts of mocks.capturedOptions) {
      expect(
        opts.timeout,
        "timeout rimosso da http.request options — regressione rilevata",
      ).toBeDefined();
    }
  });

  it("checkOta: timeout NON è undefined (rimosso)", async () => {
    await checkOta();

    for (const opts of mocks.capturedOptions) {
      expect(
        opts.timeout,
        "timeout rimosso da http.request options — regressione rilevata",
      ).toBeDefined();
    }
  });

  it("checkRoadHazards: timeout NON è 0 o negativo", async () => {
    await checkRoadHazards();

    for (const opts of mocks.capturedOptions) {
      expect(
        typeof opts.timeout === "number" && (opts.timeout as number) > 0,
        "timeout deve essere un numero positivo",
      ).toBe(true);
    }
  });

  it("checkOta: timeout NON è 0 o negativo", async () => {
    await checkOta();

    for (const opts of mocks.capturedOptions) {
      expect(
        typeof opts.timeout === "number" && (opts.timeout as number) > 0,
        "timeout deve essere un numero positivo",
      ).toBe(true);
    }
  });
});
