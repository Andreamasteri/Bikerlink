// =============================================================================
// Tests: TC Terminal auth flow — Task #524
//
// Covers the four "done looks like" criteria without a physical device:
//
//   1. Valid TC Linux credentials → 200 + signed token
//   2. BikerLink credentials (wrong SSH user/pass) → 401 "Credenziali TC non valide"
//   3. Token signing/verification roundtrip (signTcToken / verifyTcToken)
//   4. Static guard: status bar shows TC_DISPLAY_HOST, not DOMAIN
//
// The SSH verification step (verifyTcCredentials) is mocked at the bridge
// level so no live TC or Cloudflare tunnel is required.
// =============================================================================

import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import fs from "node:fs";
import path from "node:path";

// ── Environment ───────────────────────────────────────────────────────────────
vi.stubEnv("SESSION_SECRET", "test-secret-for-tc-terminal-auth");
vi.stubEnv("TC_SSH_USER", "andrea");
vi.stubEnv("TC_SSH_KEY", "-----BEGIN OPENSSH PRIVATE KEY-----\nfakekey\n-----END OPENSSH PRIVATE KEY-----\n");

// ── Mock the CF bridge so no real cloudflared is required ─────────────────────
vi.mock("../lib/tc-ssh-bridge", () => ({
  ensureTcSshBridge: vi.fn().mockResolvedValue({ ok: true, localPort: 19922 }),
  forceBridgeReset: vi.fn(),
  getTcSshBridgeStatus: vi.fn().mockReturnValue({ running: true }),
}));

// ── Mock ssh2 Client to control auth outcomes ─────────────────────────────────
// The known good password for the TC Linux user.
const GOOD_PASS = "andrea_correct_pass";

vi.mock("ssh2", () => {
  const EventEmitter = require("node:events").EventEmitter;

  function makeFakeClient() {
    const emitter = new EventEmitter();
    emitter.connect = (opts: { password?: string; privateKey?: string }) => {
      setImmediate(() => {
        if (opts.privateKey !== undefined) {
          // execSsh path — not the focus here; emit ready.
          emitter.emit("ready");
          return;
        }
        // verifyTcCredentials path: only the known good password succeeds.
        if (opts.password === GOOD_PASS) {
          emitter.emit("ready");
        } else {
          emitter.emit("error", new Error("Authentication failed"));
        }
      });
    };
    emitter.end = vi.fn();
    emitter.exec = vi.fn();
    emitter.shell = vi.fn();
    return emitter;
  }

  return { Client: vi.fn().mockImplementation(makeFakeClient) };
});

// ── Mock storage (imported transitively by ssh-exec.ts) ───────────────────────
vi.mock("../storage", () => ({
  storage: {
    getUser: vi.fn().mockResolvedValue(null),
    getAppSetting: vi.fn().mockResolvedValue(null),
    upsertAppSetting: vi.fn().mockResolvedValue({}),
    getAllAppSettings: vi.fn().mockResolvedValue([]),
  },
}));

// ── Import modules under test AFTER mocks ─────────────────────────────────────
import sshExecRouter, { signTcToken, verifyTcToken } from "../routes/ssh-exec";

function buildApp(): express.Application {
  const app = express();
  app.use(express.json());
  app.use("/api/ssh", sshExecRouter);
  return app;
}

// =============================================================================
// 1. Token signing + verification (crypto unit tests)
// =============================================================================

describe("signTcToken / verifyTcToken — roundtrip", () => {
  it("signs a token and verifies it successfully", () => {
    const token = signTcToken("andrea");
    expect(token).toMatch(/^tc:/);
    const result = verifyTcToken(token);
    expect(result).not.toBeNull();
    expect(result?.tcUsername).toBe("andrea");
  });

  it("returns null for a token with a tampered payload", () => {
    const token = signTcToken("andrea");
    const lastDot = token.lastIndexOf(".");
    const payload = token.slice(0, lastDot);
    const mac = token.slice(lastDot + 1);
    // Flip one char at the end of the payload.
    const tamperedPayload = payload.slice(0, -1) + (payload.slice(-1) === "a" ? "b" : "a");
    expect(verifyTcToken(`${tamperedPayload}.${mac}`)).toBeNull();
  });

  it("returns null for a token with a tampered MAC", () => {
    const token = signTcToken("andrea");
    const lastDot = token.lastIndexOf(".");
    const tampered = token.slice(0, lastDot + 1) + "deadbeef" + token.slice(lastDot + 9);
    expect(verifyTcToken(tampered)).toBeNull();
  });

  it("returns null for a token without the tc: prefix", () => {
    expect(verifyTcToken("s:somesession.abc123")).toBeNull();
  });

  it("returns null for an expired token", () => {
    // Build a token whose exp is already in the past.
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(Date.now() - 25 * 60 * 60 * 1000);
    const token = signTcToken("andrea");
    nowSpy.mockRestore();
    expect(verifyTcToken(token)).toBeNull();
  });

  it("different usernames produce different tokens", () => {
    const t1 = signTcToken("andrea");
    const t2 = signTcToken("root");
    expect(t1).not.toBe(t2);
    expect(verifyTcToken(t1)?.tcUsername).toBe("andrea");
    expect(verifyTcToken(t2)?.tcUsername).toBe("root");
  });
});

// =============================================================================
// 2. POST /api/ssh/terminal/auth — valid TC credentials
// =============================================================================

describe("POST /api/ssh/terminal/auth — valid TC credentials", () => {
  it("returns 200 + signed token for correct TC Linux credentials", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/ssh/terminal/auth")
      .send({ tcUsername: "andrea", tcPassword: GOOD_PASS });

    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe("string");
    expect(res.body.token).toMatch(/^tc:/);

    const decoded = verifyTcToken(res.body.token as string);
    expect(decoded).not.toBeNull();
    expect(decoded?.tcUsername).toBe("andrea");
  });
});

// =============================================================================
// 3. POST /api/ssh/terminal/auth — BikerLink or wrong credentials rejected
// =============================================================================

describe('POST /api/ssh/terminal/auth — wrong credentials → "Credenziali TC non valide"', () => {
  it("rejects wrong password with 401 and the Italian error string", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/ssh/terminal/auth")
      .send({ tcUsername: "andrea", tcPassword: "wrong_password" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Credenziali TC non valide");
  });

  it("rejects a BikerLink-style email username (fails Linux regex → 400 before SSH)", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/ssh/terminal/auth")
      .send({ tcUsername: "user@example.com", tcPassword: "somepassword" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/non valido/);
  });

  it("rejects a username with uppercase letters (not a Linux username)", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/ssh/terminal/auth")
      .send({ tcUsername: "Andrea", tcPassword: "anypass" });

    expect(res.status).toBe(400);
  });

  it("rejects missing tcUsername with 400", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/ssh/terminal/auth")
      .send({ tcPassword: "somepassword" });

    expect(res.status).toBe(400);
  });

  it("rejects missing tcPassword with 400", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/ssh/terminal/auth")
      .send({ tcUsername: "andrea" });

    expect(res.status).toBe(400);
  });

  it("rejects empty body with 400", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/ssh/terminal/auth")
      .send({});

    expect(res.status).toBe(400);
  });
});

// =============================================================================
// 4. Static guard: status bar shows TC_DISPLAY_HOST, not the API domain
// =============================================================================

describe("TC Terminal app/index.tsx — status bar host display", () => {
  const indexSource = fs.readFileSync(
    path.resolve(process.cwd(), "tc-terminal/app/index.tsx"),
    "utf8",
  );

  it('status bar renders TC_DISPLAY_HOST so users see "tc.biker-link.net"', () => {
    expect(indexSource).toContain("TC_DISPLAY_HOST");
    expect(indexSource).toContain("{TC_DISPLAY_HOST}");
  });

  it("TC_DISPLAY_HOST defaults to tc.biker-link.net", () => {
    expect(indexSource).toContain('"tc.biker-link.net"');
  });

  it("DOMAIN never appears as a bare JSX expression in the render tree", () => {
    // Template literals like `wss://${DOMAIN}/...` are fine; {DOMAIN} as JSX is not.
    // A JSX render expression is {DOMAIN} NOT preceded by '$'.
    const bareJsxDomainMatch = indexSource.match(/(?<!\$)\{DOMAIN\}/g) ?? [];
    expect(bareJsxDomainMatch.length).toBe(0);
  });

  it("DOMAIN appears only in the WSS URL construction", () => {
    const lines = indexSource.split("\n");
    // Lines that mention DOMAIN but are not comments.
    const domainLines = lines.filter((l) => l.includes("DOMAIN") && !l.trimStart().startsWith("//"));
    for (const line of domainLines) {
      const isConstDef = line.includes("const DOMAIN") || line.includes("EXPO_PUBLIC_DOMAIN");
      const isWssUrl = line.includes("wss://") || line.includes("`wss://");
      expect(isConstDef || isWssUrl, `Unexpected DOMAIN usage: ${line.trim()}`).toBe(true);
    }
  });
});

// =============================================================================
// 5. Static guard: login.tsx uses TC credential fields, not BikerLink fields
// =============================================================================

describe("TC Terminal app/login.tsx — credential field names", () => {
  const loginSource = fs.readFileSync(
    path.resolve(process.cwd(), "tc-terminal/app/login.tsx"),
    "utf8",
  );

  it("sends tcUsername and tcPassword (not the BikerLink identifier field)", () => {
    expect(loginSource).toContain("tcUsername");
    expect(loginSource).toContain("tcPassword");
    expect(loginSource).not.toContain('"identifier"');
  });

  it("login endpoint targets /api/ssh/terminal/auth, not a BikerLink auth route", () => {
    expect(loginSource).toContain("/api/ssh/terminal/auth");
    expect(loginSource).not.toContain("/api/auth/login");
  });

  it("the server error string is surfaced directly to the user", () => {
    // Ensures "Credenziali TC non valide" from the 401 reaches the UI.
    expect(loginSource).toContain("(e as Error).message");
  });
});
