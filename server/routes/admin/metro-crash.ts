import { Router } from "express";
import fs from "fs";

const METRO_CRASH_LOG = "/tmp/metro-crash-diag.jsonl";

const router = Router();

interface CrashEvent {
  ts: string;
  type: "crash" | "snapshot";
  session_id: string;
  exit_code?: number;
  signal_num?: number;
  signal_name?: string;
  verdict?: string;
  uptime_secs?: number;
  last_lines?: string;
  metro_pid?: string;
  pid_state?: string;
  mem_total_mb?: number;
  mem_used_mb?: number;
  mem_free_mb?: number;
  load_1min?: string;
  oom_found?: number;
  oom_evidence?: string;
}

interface VerdictSummary {
  platform_recycle: number;
  sigkill_oom: number;
  internal_crash: number;
  clean_exit: number;
  total_crash: number;
  total_snapshot: number;
  oom_snapshots: number;
  dominant: string | null;
  dominant_pct: number;
  first_ts: string | null;
  last_ts: string | null;
}

function computeSummary(events: CrashEvent[]): VerdictSummary {
  let platform_recycle = 0;
  let sigkill_oom = 0;
  let internal_crash = 0;
  let clean_exit = 0;
  let total_snapshot = 0;
  let oom_snapshots = 0;
  let first_ts: string | null = null;
  let last_ts: string | null = null;

  const oomSessionIds = new Set<string>();

  for (const ev of events) {
    if (ev.ts) {
      if (!first_ts || ev.ts < first_ts) first_ts = ev.ts;
      if (!last_ts || ev.ts > last_ts) last_ts = ev.ts;
    }
    if (ev.type === "snapshot") {
      total_snapshot++;
      if (ev.oom_found === 1) {
        oom_snapshots++;
        if (ev.session_id) oomSessionIds.add(ev.session_id);
      }
    } else if (ev.type === "crash") {
      switch (ev.verdict) {
        case "platform_recycle": platform_recycle++; break;
        case "sigkill_oom":     sigkill_oom++;     break;
        case "internal_crash":  internal_crash++;  break;
        case "clean_exit":      clean_exit++;      break;
      }
    }
  }

  const total_crash = platform_recycle + sigkill_oom + internal_crash + clean_exit;

  for (const sid of oomSessionIds) {
    const sessionCrashes = events.filter(
      (ev) => ev.type === "crash" && ev.session_id === sid
    );
    for (const cr of sessionCrashes) {
      if (cr.verdict === "platform_recycle") {
        platform_recycle = Math.max(0, platform_recycle - 1);
        sigkill_oom++;
      } else if (cr.verdict === "internal_crash") {
        internal_crash = Math.max(0, internal_crash - 1);
        sigkill_oom++;
      }
    }
  }

  let dominant: string | null = null;
  let dominant_pct = 0;
  if (total_crash > 0) {
    const best = Math.max(platform_recycle, sigkill_oom, internal_crash, clean_exit);
    let candidate: string | null = null;
    if (best === platform_recycle && platform_recycle > 0) candidate = "platform_recycle";
    else if (best === sigkill_oom && sigkill_oom > 0) candidate = "sigkill_oom";
    else if (best === internal_crash && internal_crash > 0) candidate = "internal_crash";
    else if (best === clean_exit && clean_exit > 0) candidate = "clean_exit";
    if (candidate) {
      const pct = Math.round((best / total_crash) * 100);
      dominant_pct = pct;
      if (pct >= 70) dominant = candidate;
    }
  }

  return {
    platform_recycle,
    sigkill_oom,
    internal_crash,
    clean_exit,
    total_crash,
    total_snapshot,
    oom_snapshots,
    dominant,
    dominant_pct,
    first_ts,
    last_ts,
  };
}

router.get("/metro-crash-log", (_req, res) => {
  let raw = "";
  try {
    if (fs.existsSync(METRO_CRASH_LOG)) {
      raw = fs.readFileSync(METRO_CRASH_LOG, "utf8");
    }
  } catch {
    return res.json({ events: [], summary: computeSummary([]) });
  }

  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  const events: CrashEvent[] = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as CrashEvent;
      events.push(parsed);
    } catch {
      /* skip malformed lines */
    }
  }

  const summary = computeSummary(events);
  return res.json({ events, summary });
});

export default router;
