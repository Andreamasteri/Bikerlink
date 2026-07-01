// Task #5322 — Test operazioni VPS (VM Google "dragonfly") via chat admin.
// Copre: rilevamento comandi distruttivi, sanitizzazione anti-secret/PII,
// invocazione gce.py (exec sync + sudo), ciclo di vita job async (SSH mockato),
// gating admin + doppia conferma sui distruttivi, nessun leak di secret.
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock SSH (gce.py via execFile) ────────────────────────────────────────────
const h = vi.hoisted(() => ({
  calls: [] as string[][],
  handler: (_args: string[]) => ({ stdout: "", stderr: "", err: null as unknown }),
}));

vi.mock("node:child_process", () => ({
  execFile: (
    _file: string,
    args: string[],
    _opts: unknown,
    cb: (err: unknown, stdout: string, stderr: string) => void,
  ) => {
    h.calls.push(args);
    const r = h.handler(args);
    process.nextTick(() => cb(r.err ?? null, r.stdout ?? "", r.stderr ?? ""));
  },
}));

// ── Mock DB (drizzle) ─────────────────────────────────────────────────────────
const dbState = vi.hoisted(() => ({
  selectRows: [] as Record<string, unknown>[],
  insertRows: [] as Record<string, unknown>[],
  updateSets: [] as Record<string, unknown>[],
}));

vi.mock("../db", () => {
  const selectChain = () => {
    const p: Record<string, unknown> = {};
    p.from = () => p;
    p.where = () => p;
    p.orderBy = () => p;
    p.limit = () => Promise.resolve(dbState.selectRows);
    return p;
  };
  return {
    db: {
      select: () => selectChain(),
      insert: () => ({ values: () => ({ returning: () => Promise.resolve(dbState.insertRows) }) }),
      update: () => ({
        set: (v: Record<string, unknown>) => ({
          where: () => {
            dbState.updateSets.push(v);
            return Promise.resolve();
          },
        }),
      }),
    },
    pool: { query: vi.fn(), connect: vi.fn() },
  };
});

vi.mock("../lib/bg-db-limiter", () => ({
  withBgDbSlot: (fn: () => unknown) => Promise.resolve(fn()),
}));

const pushMock = vi.hoisted(() => ({ fn: vi.fn(() => Promise.resolve(1)) }));
vi.mock("../push-notifications-admin", () => ({
  sendSystemAlertPushToAdmins: pushMock.fn,
}));

vi.mock("../storage", () => ({ storage: {} }));

import {
  isDestructiveCommand,
  sanitizeVpsOutput,
  execVpsCommand,
  startVpsJob,
  pollVpsJobs,
} from "../ai/assistant/vps-ops";
import { executeAdminAction } from "../ai/assistant/admin-actions";

beforeEach(() => {
  h.calls.length = 0;
  h.handler = () => ({ stdout: "", stderr: "", err: null });
  dbState.selectRows = [];
  dbState.insertRows = [];
  dbState.updateSets = [];
  pushMock.fn.mockClear();
});

describe("isDestructiveCommand", () => {
  it("riconosce i comandi distruttivi", () => {
    for (const c of [
      "rm -rf /tmp/data",
      "sudo apt-get remove nginx",
      "apt purge foo",
      "reboot",
      "shutdown -h now",
      "mkfs.ext4 /dev/sdb",
      "dd if=/dev/zero of=/dev/sda",
      ":(){ :|:& };:",
      "userdel bob",
      "systemctl stop dragonfly",
    ]) {
      expect(isDestructiveCommand(c)).toBe(true);
    }
  });

  it("lascia passare i comandi innocui", () => {
    for (const c of [
      "ls -la /tmp",
      "ping -c 4 example.com",
      "apt-get install htop",
      "echo hello",
      "uptime",
      "cat /etc/os-release",
    ]) {
      expect(isDestructiveCommand(c)).toBe(false);
    }
  });
});

describe("sanitizeVpsOutput", () => {
  it("rimuove l'output che contiene un secret", () => {
    const out = sanitizeVpsOutput("token generato: sk-abcdefghijklmnop1234567890");
    expect(out).not.toContain("sk-abcdefghijklmnop");
    expect(out).toContain("rimosso");
  });

  it("tronca l'output troppo lungo", () => {
    const big = "x".repeat(20_000);
    const out = sanitizeVpsOutput(big);
    expect(out.length).toBeLessThan(20_000);
    expect(out).toContain("troncato");
  });

  it("lascia intatto un output normale", () => {
    expect(sanitizeVpsOutput("PONG\n4 packets transmitted")).toContain("PONG");
  });
});

describe("execVpsCommand", () => {
  it("invoca gce.py exec e restituisce l'output", async () => {
    h.handler = () => ({ stdout: "Linux dragonfly 6.1", stderr: "", err: null });
    const res = await execVpsCommand("uname -a");
    expect(res.ok).toBe(true);
    expect(res.output).toContain("Linux dragonfly");
    const args = h.calls[0];
    expect(args).toContain("exec");
    expect(args).toContain("uname -a");
    expect(args).not.toContain("--sudo");
  });

  it("aggiunge --sudo quando richiesto", async () => {
    await execVpsCommand("apt-get update", { sudo: true });
    expect(h.calls[0]).toContain("--sudo");
  });

  it("non fa mai leak di un secret presente nell'output", async () => {
    h.handler = () => ({ stdout: "GROQ_API_KEY=gsk_aaaaaaaaaaaaaaaaaaaaaaaa", stderr: "", err: null });
    const res = await execVpsCommand("env");
    expect(res.output).not.toContain("gsk_");
  });
});

describe("startVpsJob (async)", () => {
  it("materializza il runner in base64, lo lancia con nohup e registra il job", async () => {
    dbState.insertRows = [{ id: "job-1", status: "running", resultsPath: "/tmp/bowie-jobs/x.log" }];
    const res = await startVpsJob({ adminUserId: "admin-1", command: "ping -c 100 example.com", label: "ping" });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.job.id).toBe("job-1");
    // 1° call = setup (base64 -d), 2° call = launch (nohup distaccato)
    expect(h.calls[0].some((a) => a.includes("base64 -d"))).toBe(true);
    expect(h.calls[1].some((a) => a.includes("nohup"))).toBe(true);
  });

  it("fallisce in modo pulito se il setup SSH non riesce", async () => {
    h.handler = () => ({ stdout: "", stderr: "connessione rifiutata", err: new Error("ssh") });
    const res = await startVpsJob({ adminUserId: "admin-1", command: "ping example.com" });
    expect(res.ok).toBe(false);
  });
});

describe("pollVpsJobs", () => {
  it("raccoglie un job finito, aggiorna lo stato e notifica l'admin", async () => {
    dbState.selectRows = [
      { id: "j1", adminUserId: "admin-1", status: "running", startedAt: new Date(), resultsPath: "/tmp/bowie-jobs/j1.log", label: "ping" },
    ];
    h.handler = (args) => {
      const cmd = args[2] ?? "";
      if (cmd.includes("__RUNNING__")) return { stdout: "0", stderr: "", err: null };
      if (cmd.includes("tail -c")) return { stdout: "PONG PONG", stderr: "", err: null };
      return { stdout: "", stderr: "", err: null };
    };
    const res = await pollVpsJobs();
    expect(res.collected).toBe(1);
    const done = dbState.updateSets.find((u) => u.status === "done");
    expect(done).toBeTruthy();
    expect(pushMock.fn).toHaveBeenCalledTimes(1);
  });

  it("lascia in esecuzione un job non ancora terminato (nessuna notifica)", async () => {
    dbState.selectRows = [
      { id: "j2", adminUserId: "admin-1", status: "running", startedAt: new Date(), resultsPath: "/tmp/bowie-jobs/j2.log" },
    ];
    h.handler = () => ({ stdout: "__RUNNING__", stderr: "", err: null });
    const res = await pollVpsJobs();
    expect(res.collected).toBe(0);
    expect(dbState.updateSets.find((u) => u.status === "done")).toBeUndefined();
    expect(pushMock.fn).not.toHaveBeenCalled();
  });
});

describe("executeAdminAction — gating VPS + doppia conferma", () => {
  it("blocca un comando distruttivo senza confirmDestructive (nessuna esecuzione)", async () => {
    const res = await executeAdminAction("vps-exec", { command: "rm -rf /var/data" }, "admin-1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/doppia conferma/i);
    expect(h.calls.length).toBe(0); // gce.py MAI invocato
  });

  it("esegue il comando distruttivo con la doppia conferma", async () => {
    h.handler = () => ({ stdout: "rimosso", stderr: "", err: null });
    const res = await executeAdminAction(
      "vps-exec",
      { command: "rm -rf /var/data", confirmDestructive: true },
      "admin-1",
    );
    expect(res.ok).toBe(true);
    expect(h.calls.length).toBeGreaterThan(0);
  });

  it("vps-job-status nega l'accesso a un job di un altro admin", async () => {
    dbState.selectRows = [{ id: "jX", adminUserId: "other-admin", status: "running" }];
    const res = await executeAdminAction("vps-job-status", { jobId: "jX" }, "admin-1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.httpStatus).toBe(403);
  });
});
