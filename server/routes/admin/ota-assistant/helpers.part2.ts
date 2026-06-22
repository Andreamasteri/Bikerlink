import { spawn, execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";
import { db } from "../../../db";
import { otaReleases, otaBootEvents, otaAssistantRuns, users } from "@shared/db";
import { eq, and } from "drizzle-orm";
import { recordOtaDecision } from "../../../ai/coordinator/integrations/ota";
import { LOG_DIR, finalizePublishRun } from "./helpers";

const execFileAsync = promisify(execFile);

export function spawnPublishJob(runId: string, message: string) {
  const logPath = path.join(LOG_DIR, `publish-${runId}.log`);
  const logStream = fs.createWriteStream(logPath, { flags: "a" });

  try {
    fs.writeFileSync(path.resolve(process.cwd(), ".ota-message"), `${message}\n`);
  } catch (err) {
    logStream.write(`[orchestrator] errore scrittura .ota-message: ${(err as Error).message}\n`);
  }

  const launch = () => spawn("bash", [path.resolve(process.cwd(), "scripts/publish-ota-full.sh")], {
    env: process.env,
    cwd: process.cwd(),
  });

  logStream.write(`[orchestrator] runId=${runId} message="${message}"\n`);
  const child = launch();
  child.stdout.on("data", (chunk) => logStream.write(chunk));
  child.stderr.on("data", (chunk) => logStream.write(chunk));

  let retried = false;
  child.on("exit", (code) => {
    logStream.write(`\n[orchestrator] exit code: ${code}\n`);
    if (code !== 0 && !retried) {
      try {
        const tail = fs.readFileSync(logPath, "utf-8").slice(-4000).toLowerCase();
        const transient = /timeout|rate.limit|econn|etimedout|graphql.*5\d\d|fetch failed/i.test(tail);
        if (transient) {
          retried = true;
          logStream.write("\n[orchestrator] errore transitorio rilevato → retry singolo tra 10s...\n");
          setTimeout(() => {
            const retry = launch();
            retry.stdout.on("data", (chunk) => logStream.write(chunk));
            retry.stderr.on("data", (chunk) => logStream.write(chunk));
            retry.on("exit", (c2) => {
              logStream.write(`\n[orchestrator] retry exit code: ${c2}\n`);
              logStream.end();
              void finalizePublishRun(runId, c2 === 0 ? "completed" : "error", c2 === 0 ? null : `publish-ota-full.sh exit ${c2} (dopo retry)`);
            });
          }, 10_000);
          return;
        }
      } catch { /* ignore */ }
    }
    logStream.end();
    void finalizePublishRun(runId, code === 0 ? "completed" : "error", code === 0 ? null : `publish-ota-full.sh exit ${code}`);
  });
  child.on("error", (err) => {
    logStream.write(`\n[orchestrator] spawn error: ${err.message}\n`);
    logStream.end();
    void finalizePublishRun(runId, "error", `spawn error: ${err.message}`);
  });

  return { runId, logPath };
}

export async function execRollbackToGroup(releaseId: string, adminId: string) {
  const [release] = await db.select().from(otaReleases).where(eq(otaReleases.id, releaseId)).limit(1);
  if (!release) return { ok: false, error: "Release non trovata" };
  if (release.status !== "approved") return { ok: false, error: `Rollback solo su release approved (stato: ${release.status})` };
  if (!release.easGroupId) return { ok: false, error: "Manca easGroupId — esegui sync prima" };
  if (!process.env.EAS_TOKEN) return { ok: false, error: "EAS_TOKEN non configurato" };

  const rollbackMessage = `Rollback to ${release.otaVersion ?? release.easUpdateId.slice(0, 8)} (by AI orchestrator)`;
  try {
    const { stdout, stderr } = await execFileAsync("npx", [
      "eas", "update", "--republish",
      "--group", release.easGroupId,
      "--message", rollbackMessage,
      "--non-interactive",
    ], {
      env: { ...process.env, EXPO_TOKEN: process.env.EAS_TOKEN, EAS_NO_VCS: "1", EAS_SKIP_AUTO_FINGERPRINT: "1" },
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    const output = `${stdout}\n${stderr}`;
    const updateIdMatch = output.match(/(?:Android|iOS|)\s*[Uu]pdate ID\s+([a-f0-9-]{36})/);
    const groupIdMatch = output.match(/Update group ID\s+([a-f0-9-]{36})/i);
    if (!updateIdMatch || !groupIdMatch) {
      return { ok: false, error: "EAS republish ok ma parsing updateId/groupId fallito — verifica su EAS e ri-esegui sync" };
    }
    const [inserted] = await db.insert(otaReleases).values({
      easUpdateId: updateIdMatch[1],
      easGroupId: groupIdMatch[1],
      channel: "production",
      runtimeVersion: release.runtimeVersion,
      message: rollbackMessage,
      otaVersion: release.otaVersion ? `${release.otaVersion}-rb` : null,
      status: "approved",
      publishedAt: new Date(),
      approvedAt: new Date(),
      approvedBy: adminId,
    }).onConflictDoUpdate({
      target: otaReleases.easUpdateId,
      set: { status: "approved", approvedAt: new Date(), approvedBy: adminId, channel: "production", easGroupId: groupIdMatch[1] },
    }).returning();
    console.log(`[ota-assistant][AUDIT] rollback ${releaseId} → ${updateIdMatch[1]} by ${adminId}`);
    return { ok: true, result: { rolledBackFrom: releaseId, newRelease: inserted } };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, error: `EAS republish fallito: ${(e.stderr || e.message || "errore").slice(0, 400)}` };
  }
}

export async function execForceUpdateDevice(args: { userId: string; releaseId: string }) {
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, args.userId)).limit(1);
  if (!user) return { ok: false, error: "Utente non trovato" };
  const [release] = await db.select({ id: otaReleases.id, status: otaReleases.status }).from(otaReleases).where(eq(otaReleases.id, args.releaseId)).limit(1);
  if (!release) return { ok: false, error: "Release non trovata" };
  if (release.status !== "approved") return { ok: false, error: `Force update solo su release approved (stato: ${release.status})` };
  try {
    await db.insert(otaBootEvents).values({
      releaseId: release.id,
      userId: user.id,
      deviceId: `forced-${Date.now()}`,
      eventType: "forced",
      platform: null,
      appVersion: null,
    });
    console.log(`[ota-assistant][AUDIT] force update user=${user.id} release=${release.id}`);
    return { ok: true, result: { userId: user.id, releaseId: release.id, signaled: true } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "errore force update" };
  }
}

export async function execMutatingTool(
  toolName: string,
  args: Record<string, unknown>,
  adminId: string,
  runId: string,
  correlationId: string,
  startedAt: number,
): Promise<{ ok: boolean; result?: unknown; error?: string; logPath?: string; async?: boolean }> {
  if (toolName === "rollbackToGroup") {
    const id = String(args.releaseId ?? "");
    if (!id) return { ok: false, error: "releaseId obbligatorio" };
    const out = await execRollbackToGroup(id, adminId);
    await recordOtaDecision({
      decisionType: "ROLLBACK", input: { adminId, releaseId: id }, output: out.ok ? (out.result ?? {}) as Record<string, unknown> : { error: out.error },
      tookMs: Date.now() - startedAt, correlationId, severity: out.ok ? "warn" : "critical",
    });
    return out;
  }
  if (toolName === "forceUpdateDevice") {
    const userId = String(args.userId ?? "");
    const releaseId = String(args.releaseId ?? "");
    if (!userId || !releaseId) return { ok: false, error: "userId e releaseId obbligatori" };
    const out = await execForceUpdateDevice({ userId, releaseId });
    await recordOtaDecision({
      decisionType: "FORCE_UPDATE", input: { adminId, userId, releaseId },
      output: out.ok ? (out.result ?? {}) as Record<string, unknown> : { error: out.error },
      tookMs: Date.now() - startedAt, correlationId, severity: "warn",
    });
    return out;
  }
  return { ok: false, error: `Tool sconosciuto in part2: ${toolName}` };
}
