import { getRedis } from "../../cache/redis";

const PAUSE_KEY = (ai: string) => `ai:paused:${ai}`;
const localPaused = new Map<string, number>();

export async function isAiPaused(aiName: string): Promise<boolean> {
  try {
    const redis = getRedis();
    if (redis) {
      const [a, all] = await Promise.all([redis.get(PAUSE_KEY(aiName)), redis.get(PAUSE_KEY("*"))]);
      return Boolean(a) || Boolean(all);
    }
  } catch { /* fallthrough */ }
  const now = Date.now();
  for (const k of [aiName, "*"]) {
    const exp = localPaused.get(k);
    if (exp === undefined) continue;
    if (exp === 0 || exp > now) return true;
    localPaused.delete(k);
  }
  return false;
}

export async function pauseAi(aiName: string, ttlSeconds: number, reason: string): Promise<void> {
  const ttl = Math.max(1, Math.min(86400, Math.floor(ttlSeconds || 3600)));
  try {
    const redis = getRedis();
    if (redis) {
      await redis.set(PAUSE_KEY(aiName), JSON.stringify({ reason, at: new Date().toISOString() }), "EX", ttl);
      return;
    }
  } catch { /* fallthrough */ }
  localPaused.set(aiName, Date.now() + ttl * 1000);
}

export async function resumeAi(aiName: string): Promise<void> {
  try {
    const redis = getRedis();
    if (redis) { await redis.del(PAUSE_KEY(aiName)); return; }
  } catch { /* fallthrough */ }
  localPaused.delete(aiName);
}

export async function listPaused(): Promise<Array<{ aiName: string; reason?: string; at?: string; ttl?: number }>> {
  const out: Array<{ aiName: string; reason?: string; at?: string; ttl?: number }> = [];
  try {
    const redis = getRedis();
    if (redis) {
      const keys: string[] = [];
      let cursor = "0";
      do {
        const [next, batch] = await redis.scan(cursor, "MATCH", "ai:paused:*", "COUNT", 100);
        cursor = next;
        if (batch.length) keys.push(...batch);
      } while (cursor !== "0");
      for (const k of keys) {
        const aiName = k.replace(/^ai:paused:/, "");
        const [val, ttl] = await Promise.all([redis.get(k), redis.ttl(k)]);
        let meta: { reason?: string; at?: string } = {};
        try { meta = val ? JSON.parse(val) : {}; } catch { /* ignore */ }
        out.push({ aiName, reason: meta.reason, at: meta.at, ttl: ttl > 0 ? ttl : undefined });
      }
      return out;
    }
  } catch { /* fallthrough */ }
  const now = Date.now();
  for (const [k, exp] of localPaused.entries()) {
    if (exp !== 0 && exp <= now) { localPaused.delete(k); continue; }
    out.push({ aiName: k, ttl: exp === 0 ? undefined : Math.floor((exp - now) / 1000) });
  }
  return out;
}
