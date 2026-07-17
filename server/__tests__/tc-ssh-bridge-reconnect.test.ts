// =============================================================================
// Test: TC SSH bridge stale-port detection + PTY reconnect (Task #506)
//
// Simula il caso in cui:
//  1. Il bridge è segnato "running" ma il listener locale non risponde
//     (TC riavviato o tunnel CF caduto → ECONNREFUSED).
//  2. ensureTcSshBridge() rileva lo stato stantio, termina il child e
//     ri-stabilisce il bridge immediatamente.
//  3. forceBridgeReset() azzera lo stato così la chiamata successiva
//     non riusa uno stato stantio.
//  4. (RACE SAFETY) L'exit event del vecchio child arrivato DOPO il reset
//     non sovrascrive lo stato del nuovo bridge né pianifica restart extra.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";

// ── Environment stubs ──────────────────────────────────────────────────────────
vi.stubEnv("TC_SSH_HOST", "ssh.biker-link.net");
vi.stubEnv("CF_ACCESS_CLIENT_ID", "test-client-id");
vi.stubEnv("CF_ACCESS_CLIENT_SECRET", "test-client-secret");
vi.stubEnv("TC_SSH_BRIDGE_LOCAL_PORT", "12222");
vi.stubEnv("CLOUDFLARED_BIN", "/fake/cloudflared");

// ── Probe queue — controls what probeLocalPort() "sees" per call ──────────────
let probeQueue: boolean[] = [];
function nextProbeResult(): boolean {
  return probeQueue.shift() ?? false;
}

// ── Mock node:net ─────────────────────────────────────────────────────────────
vi.mock("node:net", async (importOriginal) => {
  const orig = await importOriginal<typeof import("node:net")>();
  return {
    ...orig,
    createConnection: (_opts: unknown) => {
      const sock = new EventEmitter() as EventEmitter & {
        setTimeout: (ms: number) => void;
        destroy: () => void;
      };
      sock.setTimeout = () => {};
      sock.destroy = () => {};
      setImmediate(() => {
        if (nextProbeResult()) {
          sock.emit("connect");
        } else {
          sock.emit("error", Object.assign(new Error("ECONNREFUSED"), { code: "ECONNREFUSED" }));
        }
      });
      return sock;
    },
  };
});

// ── Mock node:fs ──────────────────────────────────────────────────────────────
vi.mock("node:fs", async (importOriginal) => {
  const orig = await importOriginal<typeof import("node:fs")>();
  return {
    ...orig,
    existsSync: (p: string) => {
      if (p === "/fake/cloudflared") return true;
      return orig.existsSync(p);
    },
  };
});

// ── Fake ChildProcess factory ──────────────────────────────────────────────────
function makeFakeChild() {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
    pid: number;
    simulateExit: (code?: number) => void;
  };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = vi.fn();
  proc.pid = Math.floor(Math.random() * 90000) + 10000;
  /** Helper: simulates the OS delivering the exit event after kill(). */
  proc.simulateExit = (code = 0) => setImmediate(() => proc.emit("exit", code, null));
  return proc;
}

// ── Mock node:child_process ───────────────────────────────────────────────────
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

import { spawn } from "node:child_process";
const spawnMock = vi.mocked(spawn);

// ── Test helpers ──────────────────────────────────────────────────────────────
async function loadModule() {
  vi.resetModules();
  return import("../lib/tc-ssh-bridge");
}

beforeEach(() => {
  probeQueue = [];
  spawnMock.mockReset();
});

afterEach(() => {
  probeQueue = [];
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ensureTcSshBridge — stale-port detection", () => {
  it("avvia il bridge e restituisce ok:true quando la porta risponde", async () => {
    const fakeChild = makeFakeChild();
    spawnMock.mockReturnValue(fakeChild as unknown as ReturnType<typeof spawn>);
    probeQueue = [true];

    const mod = await loadModule();
    const res = await mod.ensureTcSshBridge(2_000);

    expect(res.ok).toBe(true);
    expect(res.localPort).toBe(12222);
    expect(spawnMock).toHaveBeenCalledOnce();
  });

  it("rileva bridge stantio (running=true, porta non risponde) e ri-spawna", async () => {
    const child1 = makeFakeChild();
    const child2 = makeFakeChild();
    let spawnN = 0;
    spawnMock.mockImplementation(() => {
      spawnN += 1;
      return (spawnN === 1 ? child1 : child2) as unknown as ReturnType<typeof spawn>;
    });

    const mod = await loadModule();

    // Prima chiamata: porta OK → bridge in stato "running".
    probeQueue = [true];
    const res1 = await mod.ensureTcSshBridge(2_000);
    expect(res1.ok).toBe(true);
    expect(spawnN).toBe(1);

    // Seconda chiamata: running=true MA porta ECONNREFUSED (stale),
    // poi il nuovo bridge risponde.
    probeQueue = [false, true];
    const res2 = await mod.ensureTcSshBridge(2_000);

    expect(res2.ok).toBe(true);
    expect(child1.kill).toHaveBeenCalledWith("SIGTERM");
    expect(spawnN).toBe(2);
  });

  it("forceBridgeReset azzera running e chiama kill sul child", async () => {
    const fakeChild = makeFakeChild();
    spawnMock.mockReturnValue(fakeChild as unknown as ReturnType<typeof spawn>);
    probeQueue = [true];

    const mod = await loadModule();
    await mod.ensureTcSshBridge(2_000);

    mod.forceBridgeReset();

    const status = mod.getTcSshBridgeStatus();
    expect(status.running).toBe(false);
    expect(fakeChild.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("dopo forceBridgeReset, ensureTcSshBridge ri-stabilisce il bridge", async () => {
    const child1 = makeFakeChild();
    const child2 = makeFakeChild();
    let spawnN = 0;
    spawnMock.mockImplementation(() => {
      spawnN += 1;
      return (spawnN === 1 ? child1 : child2) as unknown as ReturnType<typeof spawn>;
    });

    const mod = await loadModule();

    probeQueue = [true];
    await mod.ensureTcSshBridge(2_000);
    expect(spawnN).toBe(1);

    mod.forceBridgeReset();
    expect(mod.getTcSshBridgeStatus().running).toBe(false);

    probeQueue = [true];
    const res2 = await mod.ensureTcSshBridge(2_000);
    expect(res2.ok).toBe(true);
    expect(spawnN).toBe(2);
  });

  it("restituisce ok:false con messaggio descrittivo se la porta non risponde entro waitMs", async () => {
    const hangingChild = makeFakeChild();
    spawnMock.mockReturnValue(hangingChild as unknown as ReturnType<typeof spawn>);
    probeQueue = []; // nessuna risposta

    const mod = await loadModule();
    const res = await mod.ensureTcSshBridge(300);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/non pronto entro/);
  });

  it("ritorna ok:false immediatamente se TC_SSH_HOST non è configurato", async () => {
    vi.stubEnv("TC_SSH_HOST", "");
    const mod = await loadModule();
    const res = await mod.ensureTcSshBridge();
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/TC_SSH_HOST/);
    vi.stubEnv("TC_SSH_HOST", "ssh.biker-link.net");
  });

  it("ritorna ok:false immediatamente se CF_ACCESS_CLIENT_ID è assente", async () => {
    vi.stubEnv("CF_ACCESS_CLIENT_ID", "");
    const mod = await loadModule();
    const res = await mod.ensureTcSshBridge();
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/CF_ACCESS_CLIENT_ID/);
    vi.stubEnv("CF_ACCESS_CLIENT_ID", "test-client-id");
  });
});

describe("exit-handler race safety", () => {
  it("l'exit del vecchio child dopo stale-reset non sovrascrive running del nuovo bridge", async () => {
    const child1 = makeFakeChild();
    const child2 = makeFakeChild();
    let spawnN = 0;
    spawnMock.mockImplementation(() => {
      spawnN += 1;
      return (spawnN === 1 ? child1 : child2) as unknown as ReturnType<typeof spawn>;
    });

    const mod = await loadModule();

    // Avvia child1.
    probeQueue = [true];
    await mod.ensureTcSshBridge(2_000);
    expect(spawnN).toBe(1);
    expect(mod.getTcSshBridgeStatus().running).toBe(true);

    // Stale-reset: child1 viene killato, child2 viene spawnato.
    probeQueue = [false, true];
    const res2 = await mod.ensureTcSshBridge(2_000);
    expect(res2.ok).toBe(true);
    expect(spawnN).toBe(2);

    // Simula l'exit di child1 che arriva in ritardo (dopo il rispawn di child2).
    // L'exit handler deve essere no-op: child !== child1 ora.
    await new Promise<void>((resolve) => {
      child1.simulateExit(0);
      setImmediate(() => {
        // Stato del nuovo bridge deve essere intatto.
        const status = mod.getTcSshBridgeStatus();
        expect(status.running).toBe(true); // child2 è vivo
        expect(spawnN).toBe(2);            // nessun terzo spawn
        resolve();
      });
    });
  });

  it("l'exit del vecchio child dopo forceBridgeReset non pianifica restart indesiderati", async () => {
    const child1 = makeFakeChild();
    const child2 = makeFakeChild();
    let spawnN = 0;
    spawnMock.mockImplementation(() => {
      spawnN += 1;
      return (spawnN === 1 ? child1 : child2) as unknown as ReturnType<typeof spawn>;
    });

    const mod = await loadModule();

    probeQueue = [true];
    await mod.ensureTcSshBridge(2_000);
    expect(spawnN).toBe(1);

    // forceBridgeReset: azzera child1.
    mod.forceBridgeReset();
    expect(mod.getTcSshBridgeStatus().running).toBe(false);

    // Ri-stabilisce con child2.
    probeQueue = [true];
    await mod.ensureTcSshBridge(2_000);
    expect(spawnN).toBe(2);

    // L'exit tardivo di child1 non deve causare un terzo spawn.
    await new Promise<void>((resolve) => {
      child1.simulateExit(1);
      // Lasciamo girare i timer/setImmediate pendenti.
      setImmediate(() => setImmediate(() => {
        expect(spawnN).toBe(2);
        expect(mod.getTcSshBridgeStatus().running).toBe(true);
        resolve();
      }));
    });
  });

  it("spawnBridge non spawna se child è già presente (guard idempotenza)", async () => {
    const child1 = makeFakeChild();
    const child2 = makeFakeChild();
    let spawnN = 0;
    spawnMock.mockImplementation(() => {
      spawnN += 1;
      return (spawnN === 1 ? child1 : child2) as unknown as ReturnType<typeof spawn>;
    });

    const mod = await loadModule();

    // Prima chiamata: bridge avviato con successo.
    probeQueue = [true];
    await mod.ensureTcSshBridge(2_000);
    expect(spawnN).toBe(1);

    // Seconda chiamata immediata mentre child è già presente e la porta risponde:
    // deve riusare il bridge esistente senza un secondo spawn.
    probeQueue = [true];
    const res2 = await mod.ensureTcSshBridge(2_000);
    expect(res2.ok).toBe(true);
    expect(spawnN).toBe(1); // nessun secondo spawn
  });
});

// ── Runbook: verifica manuale del reconnect WS PTY ─────────────────────────────
//
// Per verificare in produzione che il reconnect avvenga entro 30s:
//
// 1. Aprire la TC Terminal dall'app (sessione WS attiva).
// 2. Sul ThinkCentre: `sudo reboot` (o interrompere cloudflared manualmente).
// 3. Il WS riceve ECONNREFUSED dalla connessione SSH.
// 4. Il server chiama forceBridgeReset() + ensureTcSshBridge() (≤8s).
// 5. Nuovo SSH connect (readyTimeout=15s).
// 6. L'app chiude il WS con codice 1011; il client RN riapre un nuovo WS.
// 7. Sessione PTY disponibile entro ~25s dal riavvio del TC o del tunnel CF.
//
// Log server attesi:
//   [ssh-terminal-ws] ECONNREFUSED su porta 12222 — bridge stantio rilevato, re-stabilire...
//   [tc-ssh-bridge] forceBridgeReset: terminazione bridge stantio
//   [tc-ssh-bridge] bridge segnalato running ma porta 12222 non raggiungibile — re-stabilire (stale bridge)
//   [tc-ssh-bridge] avvio bridge: /path/to/cloudflared access tcp ...
