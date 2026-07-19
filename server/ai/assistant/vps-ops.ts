// Task #5322 — Operazioni sul VPS Google "dragonfly" avviate da un admin in chat.
//
// Bowie/Horus, SOLO in conversazione con un admin e SOLO dopo conferma esplicita,
// possono operare sulla VM Google riusando l'accesso SSH già esistente
// (scripts/gce/gce.py, secret GCE_SSH_*). L'esecuzione è SEMPRE server-side.
//
// Due modalità:
//   - exec sincrono breve  → execVpsCommand()  (output raccolto e restituito)
//   - job lungo asincrono  → startVpsJob()      (nohup distaccato + tabella +
//                            poller pollVpsJobs() che raccoglie l'esito)
//
// Guardrail applicati qui (oltre a authz/conferma dell'endpoint):
//   - timeout su ogni comando, tetto sull'output raccolto;
//   - sanitizzazione anti-secret/PII prima di restituire o persistere output;
//   - la chiave privata NON transita mai da qui: è gce.py a leggerla dal secret.
import { execFile } from "node:child_process";
import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "../../db";
import { aiVpsJobs, type AiVpsJob } from "@shared/db";
import { withBgDbSlot } from "../../lib/bg-db-limiter";
import { redactPII } from "../moderation/redact";
import { matchesSensitive } from "./security-filter";
import { sendSystemAlertPushToAdmins } from "../../push-notifications-admin";

const GCE_SCRIPT = "scripts/gce/gce.py";
const JOBS_DIR = "/tmp/bowie-jobs";

/** Ritorna true solo se i secret SSH GCE minimi sono presenti. Usato in Phase 5
 *  per evitare di registrare il poller (e loggare stack trace ogni 2 min) quando
 *  il VPS Google non è configurato. */
export function isGceConfigured(): boolean {
  return !!(process.env.GCE_SSH_KEY?.trim() && process.env.GCE_SSH_HOST?.trim());
}
const EXEC_TIMEOUT_MS = 120_000; // exec sincrono: max 2 min
const POLL_EXEC_TIMEOUT_MS = 30_000; // comandi del poller: brevi
const MAX_OUTPUT_CHARS = 6_000; // tetto output raccolto/persistito
const JOB_MAX_AGE_MS = 26 * 60 * 60 * 1000; // job "running" oltre 26h → timeout

// ── Sanitizzazione ────────────────────────────────────────────────────────────
// Non stampiamo MAI un secret in chat/log/DB. Se l'output contiene un pattern
// sensibile lo sostituiamo del tutto; altrimenti redigiamo la PII residua.
export function sanitizeVpsOutput(raw: string): string {
  const capped = raw.length > MAX_OUTPUT_CHARS
    ? raw.slice(-MAX_OUTPUT_CHARS) + "\n…[output troncato]"
    : raw;
  // Il check anti-secret va PRIMA della redazione PII: redactPII potrebbe spezzare
  // un token (es. la parte numerica di una API key) quel tanto da farlo sfuggire a
  // matchesSensitive, lasciando trapelare un frammento di segreto.
  if (matchesSensitive(capped)) {
    return "[output rimosso: conteneva dati potenzialmente sensibili]";
  }
  return redactPII(capped);
}

// ── Rilevatore di comandi distruttivi (→ doppia conferma) ─────────────────────
const DESTRUCTIVE_PATTERNS: RegExp[] = [
  /\brm\s+(-[a-z]*f|-[a-z]*r|--force|--recursive)/i,
  /\brm\s+-\w*\s+\//i,
  /\b(mkfs|fdisk|parted|dd)\b/i,
  /\b(shutdown|reboot|halt|poweroff|init\s+0|init\s+6)\b/i,
  /\bapt(-get)?\s+(remove|purge|autoremove)\b/i,
  /\b(dpkg\s+(-r|--remove|-P|--purge)|yum\s+remove|dnf\s+remove)\b/i,
  /\b(userdel|groupdel|deluser)\b/i,
  /\bdrop\s+(database|table|schema)\b/i,
  /\bsystemctl\s+(stop|disable|mask)\b/i,
  /\bkill(all)?\s+-9\b/i,
  /:\(\)\s*\{.*\}\s*;/, // fork bomb
  /\/dev\/(sd|nvme|null|zero)\b.*>/i,
  /\bchmod\s+-R\s+0*000\b/i,
  /\btruncate\b/i,
  /\bmv\s+\/\s/i,
];

export function isDestructiveCommand(command: string): boolean {
  const c = (command || "").trim();
  if (!c) return false;
  return DESTRUCTIVE_PATTERNS.some((re) => re.test(c));
}

// ── Invocazione di gce.py (mai la chiave) ─────────────────────────────────────
function runGce(
  args: string[],
  timeoutMs: number,
): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    execFile(
      "python3",
      [GCE_SCRIPT, ...args],
      { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, killSignal: "SIGKILL" },
      (err, stdout, stderr) => {
        const combined = `${stdout ?? ""}${stderr ?? ""}`.trim();
        if (err) {
          // timeout o exit non-zero: restituiamo comunque l'output (sanificato a valle)
          const reason = (err as { killed?: boolean }).killed ? "timeout" : "errore SSH/comando";
          resolve({ ok: false, output: combined || `Esecuzione VPS fallita (${reason}).` });
          return;
        }
        resolve({ ok: true, output: combined });
      },
    );
  });
}

/** Esegue un comando sincrono sul VPS e restituisce l'output sanificato. */
export async function execVpsCommand(
  command: string,
  opts: { sudo?: boolean } = {},
): Promise<{ ok: boolean; output: string }> {
  const args = ["exec", command, ...(opts.sudo ? ["--sudo"] : [])];
  const res = await runGce(args, EXEC_TIMEOUT_MS);
  return { ok: res.ok, output: sanitizeVpsOutput(res.output) };
}

// ── Job asincroni lunghi ──────────────────────────────────────────────────────
// L'avvio è non-bloccante: scriviamo un runner sul VPS (via base64 per evitare
// ogni problema di quoting), lo lanciamo con nohup distaccato, e registriamo il
// job. Il runner scrive l'output su <resultsPath> e il codice d'uscita su
// <resultsPath>.exit quando ha finito — è così che il poller sa che è pronto.
function buildRunnerScript(command: string, resultsPath: string): string {
  const donePath = `${resultsPath}.exit`;
  return [
    "#!/bin/bash",
    `( ${command} ) > ${JSON.stringify(resultsPath)} 2>&1`,
    `echo $? > ${JSON.stringify(donePath)}`,
    "",
  ].join("\n");
}

export async function startVpsJob(params: {
  adminUserId: string;
  command: string;
  label?: string;
}): Promise<{ ok: true; job: AiVpsJob } | { ok: false; error: string }> {
  const jobId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const resultsPath = `${JOBS_DIR}/${jobId}.log`;
  const scriptPath = `${JOBS_DIR}/${jobId}.sh`;
  const runner = buildRunnerScript(params.command, resultsPath);
  const b64 = Buffer.from(runner, "utf8").toString("base64");

  // 1) crea la dir + materializza il runner dal base64 (nessun quoting fragile).
  const setup = `mkdir -p ${JOBS_DIR} && printf '%s' ${b64} | base64 -d > ${scriptPath} && chmod +x ${scriptPath}`;
  const setupRes = await runGce(["exec", setup], POLL_EXEC_TIMEOUT_MS);
  if (!setupRes.ok) {
    return { ok: false, error: sanitizeVpsOutput(setupRes.output) };
  }

  // 2) lancia il runner distaccato (nohup): ritorna subito.
  const launch = `nohup bash ${scriptPath} >/dev/null 2>&1 & echo avviato`;
  const launchRes = await runGce(["exec", launch], POLL_EXEC_TIMEOUT_MS);
  if (!launchRes.ok) {
    return { ok: false, error: sanitizeVpsOutput(launchRes.output) };
  }

  const inserted = await db
    .insert(aiVpsJobs)
    .values({
      adminUserId: params.adminUserId,
      kind: "job",
      command: params.command,
      label: params.label ?? null,
      status: "running",
      resultsPath,
    })
    .returning();
  return { ok: true, job: inserted[0] };
}

export async function getVpsJob(id: string): Promise<AiVpsJob | undefined> {
  const rows = await db.select().from(aiVpsJobs).where(eq(aiVpsJobs.id, id)).limit(1);
  return rows[0];
}

export async function listRecentVpsJobs(adminUserId: string, limit = 10): Promise<AiVpsJob[]> {
  return db
    .select()
    .from(aiVpsJobs)
    .where(eq(aiVpsJobs.adminUserId, adminUserId))
    .orderBy(desc(aiVpsJobs.startedAt))
    .limit(limit);
}

// ── Poller (registrato in Phase 5) ────────────────────────────────────────────
// Raccoglie l'esito dei job "running": legge il marcatore <resultsPath>.exit sul
// VPS; se presente, salva output+exitCode e notifica l'admin (una volta sola).
// I job troppo vecchi vengono marcati "error" (timeout). Rispetta il budget pool
// (withBgDbSlot) e limita il lavoro per ciclo.
const POLL_MAX_JOBS_PER_CYCLE = 3;

export async function pollVpsJobs(): Promise<{ collected: number; timedOut: number }> {
  let collected = 0;
  let timedOut = 0;

  const running = await withBgDbSlot(() =>
    db
      .select()
      .from(aiVpsJobs)
      .where(eq(aiVpsJobs.status, "running"))
      .orderBy(aiVpsJobs.startedAt)
      .limit(POLL_MAX_JOBS_PER_CYCLE),
  );
  if (running.length === 0) return { collected, timedOut };

  const now = Date.now();
  for (const job of running) {
    // Job troppo vecchio → timeout infrastrutturale.
    if (now - new Date(job.startedAt).getTime() > JOB_MAX_AGE_MS) {
      await withBgDbSlot(() =>
        db
          .update(aiVpsJobs)
          .set({ status: "error", errorMessage: "Timeout: job oltre la durata massima.", finishedAt: new Date() })
          .where(eq(aiVpsJobs.id, job.id)),
      );
      timedOut += 1;
      continue;
    }

    if (!job.resultsPath) continue;
    const donePath = `${job.resultsPath}.exit`;
    // Se il marcatore esiste, ne leggiamo il codice; altrimenti __RUNNING__.
    const probe = `if [ -f ${JSON.stringify(donePath)} ]; then cat ${JSON.stringify(donePath)}; else echo __RUNNING__; fi`;
    const probeRes = await runGce(["exec", probe], POLL_EXEC_TIMEOUT_MS);
    if (!probeRes.ok) continue; // riproveremo al prossimo ciclo
    const marker = probeRes.output.trim();
    if (marker === "__RUNNING__" || marker === "") continue;

    const exitCode = Number.parseInt(marker, 10);
    const tailRes = await runGce(["exec", `tail -c ${MAX_OUTPUT_CHARS} ${JSON.stringify(job.resultsPath)}`], POLL_EXEC_TIMEOUT_MS);
    const summary = sanitizeVpsOutput(tailRes.output);
    const status = Number.isFinite(exitCode) && exitCode === 0 ? "done" : "failed";

    await withBgDbSlot(() =>
      db
        .update(aiVpsJobs)
        .set({
          status,
          exitCode: Number.isFinite(exitCode) ? exitCode : null,
          resultSummary: summary,
          finishedAt: new Date(),
        })
        .where(eq(aiVpsJobs.id, job.id)),
    );
    collected += 1;

    // Recapito all'admin (best-effort, una sola volta).
    try {
      const label = job.label ? `"${job.label}"` : `job ${job.id.slice(0, 8)}`;
      await sendSystemAlertPushToAdmins(
        `VPS ${status === "done" ? "completato" : "terminato con errore"}`,
        `Il ${label} sul VPS è terminato (exit ${Number.isFinite(exitCode) ? exitCode : "?"}). Chiedimelo in chat per i dettagli.`,
        { kind: "vps_job_done", jobId: job.id, status },
      );
      await withDbNotified(job.id);
    } catch {
      /* push best-effort */
    }
    console.info(`[vps-ops] job ${job.id} → ${status} (exit ${marker})`);
  }

  return { collected, timedOut };
}

async function withDbNotified(jobId: string): Promise<void> {
  await withBgDbSlot(() =>
    db.update(aiVpsJobs).set({ notifiedAt: new Date() }).where(eq(aiVpsJobs.id, jobId)),
  );
}

// Marca come "error" eventuali job orfani all'avvio del server (best-effort).
export async function reapStaleVpsJobsOnBoot(): Promise<void> {
  const cutoff = new Date(Date.now() - JOB_MAX_AGE_MS);
  await db
    .update(aiVpsJobs)
    .set({ status: "error", errorMessage: "Job orfano: server riavviato.", finishedAt: new Date() })
    .where(and(eq(aiVpsJobs.status, "running"), lt(aiVpsJobs.startedAt, cutoff)));
}
