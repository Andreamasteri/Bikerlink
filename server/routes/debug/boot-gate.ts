// Task #4979 — OTA Bisect — endpoint server del BootGate (Livello B passivo).
//
// - POST /api/debug/boot-gate/ping   : riceve { deviceId, step, status, ts } e li
//   salva in memoria (Map in-process, NIENTE DB). Aperto SENZA auth per catturare
//   i ping anche pre-login / pre-render React.
// - GET  /api/debug/boot-gate/status : elenco degli step ricevuti per device.
//   Richiede ruolo admin.
// - POST /api/debug/boot-gate/enable : attiva/disattiva il flag remoto
//   `boot_gate_enabled` in app_settings. Richiede ruolo admin.
//
// Lo store è volatile per design: serve solo durante una sessione di bisect attiva
// e non deve sporcare il DB con telemetria di boot ad alta frequenza.
import { Router, type Request, type Response } from "express";
import { db } from "../../db";
import { users, appSettings } from "@shared/db";
import { eq } from "drizzle-orm";

const router = Router();

interface BootPingEntry {
  step: string;
  status: string;
  ts: number;
  note: string | null;
}

interface DeviceBootState {
  deviceId: string;
  platform: string | null;
  appVersion: string | null;
  firstSeen: number;
  lastSeen: number;
  entries: BootPingEntry[];
}

// Cap difensivi: il BootGate è una sessione diagnostica breve, non un firehose.
const MAX_DEVICES = 50;
const MAX_ENTRIES_PER_DEVICE = 200;

const deviceStates = new Map<string, DeviceBootState>();
let lastDeviceId: string | null = null;

function pruneOldestDeviceIfNeeded(): void {
  if (deviceStates.size <= MAX_DEVICES) return;
  let oldestId: string | null = null;
  let oldestTs = Infinity;
  for (const [id, st] of deviceStates) {
    if (st.lastSeen < oldestTs) {
      oldestTs = st.lastSeen;
      oldestId = id;
    }
  }
  if (oldestId) deviceStates.delete(oldestId);
}

async function isAdminRequest(req: Request): Promise<boolean> {
  const userId = (req.session as { userId?: string } | undefined)?.userId;
  if (!userId) return false;
  try {
    const [row] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return row?.role === "admin";
  } catch {
    return false;
  }
}

// ── POST /ping — pubblico (cattura anche ping pre-login) ──────────────────────
router.post("/ping", (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as {
      deviceId?: unknown;
      step?: unknown;
      status?: unknown;
      ts?: unknown;
      platform?: unknown;
      appVersion?: unknown;
      note?: unknown;
    };

    const deviceId = typeof body.deviceId === "string" && body.deviceId ? body.deviceId.slice(0, 64) : "unknown";
    const step = typeof body.step === "string" ? body.step.slice(0, 80) : "";
    const status = typeof body.status === "string" ? body.status.slice(0, 32) : "";
    if (!step || !status) {
      return res.status(400).json({ ok: false, error: "step e status sono obbligatori" });
    }
    const ts = typeof body.ts === "number" && Number.isFinite(body.ts) ? body.ts : Date.now();
    const platform = typeof body.platform === "string" ? body.platform.slice(0, 16) : null;
    const appVersion = typeof body.appVersion === "string" ? body.appVersion.slice(0, 40) : null;
    const note = typeof body.note === "string" ? body.note.slice(0, 200) : null;

    let state = deviceStates.get(deviceId);
    if (!state) {
      state = {
        deviceId,
        platform,
        appVersion,
        firstSeen: ts,
        lastSeen: ts,
        entries: [],
      };
      deviceStates.set(deviceId, state);
    }
    state.lastSeen = ts;
    if (platform) state.platform = platform;
    if (appVersion) state.appVersion = appVersion;
    state.entries.push({ step, status, ts, note });
    if (state.entries.length > MAX_ENTRIES_PER_DEVICE) {
      state.entries.splice(0, state.entries.length - MAX_ENTRIES_PER_DEVICE);
    }
    lastDeviceId = deviceId;
    pruneOldestDeviceIfNeeded();

    return res.json({ ok: true });
  } catch (err) {
    console.error("[boot-gate/ping] error:", err);
    return res.status(500).json({ ok: false });
  }
});

// ── GET /status — admin only ─────────────────────────────────────────────────
router.get("/status", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) {
    return res.status(403).json({ message: "Accesso non autorizzato" });
  }
  const devices = Array.from(deviceStates.values())
    .sort((a, b) => b.lastSeen - a.lastSeen)
    .map((st) => ({
      deviceId: st.deviceId,
      platform: st.platform,
      appVersion: st.appVersion,
      firstSeen: st.firstSeen,
      lastSeen: st.lastSeen,
      entryCount: st.entries.length,
      lastEntry: st.entries[st.entries.length - 1] ?? null,
      entries: st.entries,
    }));

  let bootGateEnabled = false;
  try {
    const [row] = await db
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, "boot_gate_enabled"))
      .limit(1);
    bootGateEnabled = row?.value === "true";
  } catch {
    // ignore: il flag non è critico per la sola lettura dello status
  }

  return res.json({ bootGateEnabled, lastDeviceId, devices });
});

// ── POST /enable — admin only ────────────────────────────────────────────────
router.post("/enable", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) {
    return res.status(403).json({ message: "Accesso non autorizzato" });
  }
  const enabled = (req.body as { enabled?: unknown })?.enabled === true;
  try {
    await db
      .insert(appSettings)
      .values({
        key: "boot_gate_enabled",
        value: enabled ? "true" : "false",
        description: "Task #4979 — attiva il BootGate diagnostico sui device admin al prossimo avvio.",
      })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value: enabled ? "true" : "false", updatedAt: new Date() },
      });
    return res.json({ ok: true, bootGateEnabled: enabled });
  } catch (err) {
    console.error("[boot-gate/enable] error:", err);
    return res.status(500).json({ ok: false });
  }
});

// ── POST /reset — admin only: svuota lo store in memoria ──────────────────────
router.post("/reset", async (req: Request, res: Response) => {
  if (!(await isAdminRequest(req))) {
    return res.status(403).json({ message: "Accesso non autorizzato" });
  }
  deviceStates.clear();
  lastDeviceId = null;
  return res.json({ ok: true });
});

export default router;
