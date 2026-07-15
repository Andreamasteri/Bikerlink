/**
 * Task #2566 — Verifica Finale Integrazione Matching System.
 */
import { promises as fs } from "node:fs";
import * as path from "node:path";

export const ROOT = process.cwd();
export const OUT_DIR = path.join(ROOT, ".local", "verification");
export const REPORT_MD = path.join(OUT_DIR, "verification-report.md");
export const REPORT_JSON = path.join(OUT_DIR, "verification-report.json");

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface Gap {
  severity: Severity;
  check: string;
  what: string;
  where?: string;
  suggestion?: string;
}

export interface CheckResult {
  id: string;
  name: string;
  status: "ok" | "warn" | "fail" | "skipped";
  gaps: Gap[];
  meta?: Record<string, unknown>;
  durationMs: number;
}

export const sevOrder: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export async function readFileSafe(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, "utf8");
  } catch {
    return null;
  }
}

export async function listFiles(dir: string, exts: string[]): Promise<string[]> {
  const out: string[] = [];
  async function walk(d: string) {
    let entries;
    try {
      entries = await fs.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) await walk(full);
      else if (exts.some((x) => e.name.endsWith(x))) out.push(full);
    }
  }
  await walk(dir);
  return out;
}

export async function runCheck(
  id: string,
  name: string,
  fn: () => Promise<{ status: CheckResult["status"]; gaps: Gap[]; meta?: Record<string, unknown> }>
): Promise<CheckResult> {
  const t0 = Date.now();
  try {
    const r = await fn();
    return { id, name, status: r.status, gaps: r.gaps, meta: r.meta, durationMs: Date.now() - t0 };
  } catch (err) {
    return {
      id,
      name,
      status: "fail",
      gaps: [
        {
          severity: "high",
          check: id,
          what: `Check ${id} ha lanciato eccezione: ${(err as Error).message}`,
        },
      ],
      durationMs: Date.now() - t0,
    };
  }
}

async function checkRegistryVsSchema() {
  const { MATCHING_REGISTRY } = await import("../shared/matching-registry");
  const matchingSchema = await readFileSafe(path.join(ROOT, "shared/db/matching.ts")) ?? "";
  const expectedTables = new Set(
    MATCHING_REGISTRY.map((t) => t.table).filter((t): t is NonNullable<typeof t> => !!t)
  );
  const gaps: Gap[] = [];
  for (const t of expectedTables) {
    const re = new RegExp(`pgTable\\(\\s*["']${t}["']`);
    if (!re.test(matchingSchema)) {
      gaps.push({
        severity: "critical",
        check: "registry-vs-schema",
        what: `Tabella '${t}' attesa dal registry ma non trovata in shared/db/matching.ts`,
        suggestion: `Aggiungere pgTable("${t}", ...) o rimuovere dal registry`,
      });
    }
  }
  return {
    status: gaps.length ? ("fail" as const) : ("ok" as const),
    gaps,
    meta: { expectedTables: [...expectedTables] },
  };
}

async function checkRegistryVsPreferences() {
  const { getRegistryPrefColumns } = await import("../shared/matching-registry");
  const { matchPreferences } = await import("../shared/db/matching");
  const schemaCols = new Set(
    Object.values(matchPreferences as unknown as Record<string, unknown>)
      .map((v) => (v as { name?: string })?.name)
      .filter((n): n is string => typeof n === "string")
  );
  const registryCols = getRegistryPrefColumns();
  const gaps: Gap[] = [];
  for (const c of registryCols) {
    if (!schemaCols.has(c)) {
      gaps.push({
        severity: "high",
        check: "registry-vs-preferences",
        what: `Registry ha prefColumn '${c}' che non esiste in match_preferences`,
        where: "shared/db/matching.ts → matchPreferences",
        suggestion: `Aggiungere boolean("${c}").notNull().default(true) e generare migration`,
      });
    }
  }
  const SOFT = new Set(["id", "user_id", "updated_at", "direct_match", "top_matches_only", "weekly_recap", "enableRLS", "enableRls"]);
  const orphan = [...schemaCols].filter((c) => !SOFT.has(c) && !registryCols.includes(c));
  for (const c of orphan) {
    gaps.push({
      severity: "low",
      check: "registry-vs-preferences",
      what: `Colonna match_preferences '${c}' non ha entry nel registry`,
      suggestion: "Aggiungere entry in MATCHING_REGISTRY oppure rimuovere colonna",
    });
  }
  return {
    status: gaps.some((g) => g.severity === "critical" || g.severity === "high")
      ? ("fail" as const)
      : gaps.length
        ? ("warn" as const)
        : ("ok" as const),
    gaps,
    meta: { registryCount: registryCols.length, schemaCount: schemaCols.size, orphanCount: orphan.length },
  };
}

async function checkRegistryVsUi() {
  const { MATCHING_REGISTRY } = await import("../shared/matching-registry");
  const uiFiles = [
    "app/admin/match-control.tsx",
    "app/admin/match-health.tsx",
    "app/admin/matching-hub.tsx",
    "components/match-preferences-edit.tsx",
    "lib/match-pref-items.ts",
  ];
  const contents: Record<string, string> = {};
  for (const f of uiFiles) {
    const c = await readFileSafe(path.join(ROOT, f));
    if (c !== null) contents[f] = c;
  }
  const aggregate = Object.values(contents).join("\n");
  const gaps: Gap[] = [];
  for (const t of MATCHING_REGISTRY) {
    if (t.table === null) continue;
    const referenced = aggregate.includes(t.key) || aggregate.includes(t.prefColumn);
    if (!referenced) {
      gaps.push({
        severity: "medium",
        check: "registry-vs-ui",
        what: `Tipo match '${t.key}' (col ${t.prefColumn}) non referenziato in alcun file UI tracciato`,
        where: uiFiles.join(", "),
        suggestion: "Esporre in match-pref-items.ts o nel pannello admin matching-hub",
      });
    }
  }
  return {
    status: gaps.length ? ("warn" as const) : ("ok" as const),
    gaps,
    meta: { uiFilesFound: Object.keys(contents).length, uiFilesMissing: uiFiles.length - Object.keys(contents).length },
  };
}

async function checkRegistryVsManual() {
  const { MATCHING_REGISTRY } = await import("../shared/matching-registry");
  const candidates = await listFiles(path.join(ROOT, "server", "site"), [".ts", ".tsx", ".md", ".html"]).catch(() => []);
  const manualFiles = await listFiles(path.join(ROOT, "content"), [".md", ".mdx"]).catch(() => []);
  const files = [...candidates, ...manualFiles];
  let aggregate = "";
  for (const f of files) {
    const c = await readFileSafe(f);
    if (c) aggregate += "\n" + c;
  }
  const gaps: Gap[] = [];
  if (aggregate.length === 0) {
    return {
      status: "skipped" as const,
      gaps: [
        {
          severity: "info" as const,
          check: "registry-vs-manual",
          what: "Nessun file manuale trovato in server/site o content/ — check saltato",
        },
      ],
      meta: { filesScanned: 0 },
    };
  }
  for (const t of MATCHING_REGISTRY) {
    if (!aggregate.includes(t.key) && !aggregate.includes(t.label)) {
      gaps.push({
        severity: "low",
        check: "registry-vs-manual",
        what: `Tipo '${t.label}' (key=${t.key}) non documentato nel manuale`,
        suggestion: "Aggiungere paragrafo nella pagina manuale /matching/tipi-di-match",
      });
    }
  }
  return {
    status: gaps.length ? ("warn" as const) : ("ok" as const),
    gaps,
    meta: { filesScanned: files.length },
  };
}

async function checkPackages() {
  const pkgRaw = await readFileSafe(path.join(ROOT, "package.json"));
  if (!pkgRaw) return { status: "skipped" as const, gaps: [], meta: { reason: "package.json not found" } };
  const pkg = JSON.parse(pkgRaw);
  const installed = new Set<string>([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ]);
  const overrideNames = new Set<string>();
  const collectOverrides = (obj: unknown) => {
    if (!obj || typeof obj !== "object") return;
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      overrideNames.add(k);
      if (v && typeof v === "object") collectOverrides(v);
    }
  };
  collectOverrides(pkg.overrides);
  collectOverrides(pkg.resolutions);

  const tasksDir = path.join(ROOT, ".local", "tasks");
  const taskFiles = await listFiles(tasksDir, [".md"]).catch(() => []);
  const declared = new Map<string, string[]>();
  const ALLOWED_SECTIONS = /^##\s+(versioni\s+e\s+compatibilit[àa]|npm\s+da\s+installare)\b/i;
  const SECTION_BOUNDARY = /^##\s+/;
  const re = /`([a-z0-9._-]+(?:\/[a-z0-9._-]+)?)@\^[\d.]+`/gi;
  for (const f of taskFiles) {
    const c = await readFileSafe(f);
    if (!c) continue;
    const lines = c.split(/\r?\n/);
    const buckets: string[] = [];
    let active: string[] | null = null;
    for (const ln of lines) {
      if (SECTION_BOUNDARY.test(ln)) {
        if (active) { buckets.push(active.join("\n")); active = null; }
        if (ALLOWED_SECTIONS.test(ln)) active = [];
        continue;
      }
      if (active) active.push(ln);
    }
    if (active) buckets.push(active.join("\n"));
    if (buckets.length === 0) continue;
    const scanned = buckets.join("\n");
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(scanned)) !== null) {
      const name = m[1];
      if (name.startsWith("@types/")) continue;
      if (!declared.has(name)) declared.set(name, []);
      declared.get(name)!.push(path.relative(ROOT, f));
    }
  }
  const gaps: Gap[] = [];
  for (const [name, sources] of declared.entries()) {
    if (installed.has(name) || overrideNames.has(name)) continue;
    gaps.push({
      severity: "high",
      check: "packages",
      what: `Package '${name}' dichiarato nei task ma NON installato`,
      where: sources.slice(0, 3).join(", ") + (sources.length > 3 ? ` (+${sources.length - 3})` : ""),
      suggestion: `Installare con il packager tool oppure rimuovere riferimento dai task`,
    });
  }
  return { status: gaps.length ? ("warn" as const) : ("ok" as const), gaps, meta: { declaredCount: declared.size, installedCount: installed.size, overrideCount: overrideNames.size, taskFilesScanned: taskFiles.length } };
}

async function checkI18n() {
  const itPath = path.join(ROOT, "lib/i18n/it.ts");
  const enPath = path.join(ROOT, "lib/i18n/en.ts");
  const it = await readFileSafe(itPath);
  const en = await readFileSafe(enPath);
  if (!it || !en) return { status: "skipped" as const, gaps: [{ severity: "info" as const, check: "i18n", what: "Lingue it.ts/en.ts non trovate in lib/i18n" }], meta: {} };
  const extractKeys = (src: string): Set<string> => {
    const keys = new Set<string>();
    const re = /^\s{2}["']?([A-Za-z0-9_]+)["']?\s*:/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) keys.add(m[1]);
    return keys;
  };
  const itKeys = extractKeys(it);
  const enKeys = extractKeys(en);
  const gaps: Gap[] = [];
  for (const k of itKeys) { if (!enKeys.has(k)) gaps.push({ severity: "low", check: "i18n", what: `Chiave i18n '${k}' presente in IT ma assente in EN`, suggestion: "Aggiungere traduzione" }); }
  for (const k of enKeys) { if (!itKeys.has(k)) gaps.push({ severity: "low", check: "i18n", what: `Chiave i18n '${k}' presente in EN ma assente in IT`, suggestion: "Aggiungere traduzione" }); }
  return { status: gaps.length ? ("warn" as const) : ("ok" as const), gaps, meta: { itKeyCount: itKeys.size, enKeyCount: enKeys.size, diffCount: gaps.length } };
}

import { checkAdminEndpoints, checkReplitMd, renderMd } from "./verify-matching-integration.part2";

type CheckSpec = { id: string; name: string; fn: () => Promise<{ status: CheckResult["status"]; gaps: Gap[]; meta?: Record<string, unknown> }> };

const ALL_CHECKS: CheckSpec[] = [
  { id: "registry-vs-schema", name: "Registry → Schema tables", fn: checkRegistryVsSchema },
  { id: "registry-vs-preferences", name: "Registry → match_preferences columns", fn: checkRegistryVsPreferences },
  { id: "registry-vs-ui", name: "Registry → UI references", fn: checkRegistryVsUi },
  { id: "registry-vs-manual", name: "Registry → Manuale", fn: checkRegistryVsManual },
  { id: "packages", name: "Npm packages dichiarati vs installati", fn: checkPackages },
  { id: "i18n", name: "i18n coverage IT vs EN", fn: checkI18n },
  { id: "admin-endpoints", name: "Endpoint admin con middleware", fn: checkAdminEndpoints },
  { id: "replit-md", name: "Sezioni replit.md attese", fn: checkReplitMd },
];

async function main() {
  const argv = process.argv.slice(2);
  let only: Set<string> | null = null;
  let jsonOnly = false;
  for (const a of argv) {
    if (a.startsWith("--check=")) only = new Set(a.slice("--check=".length).split(","));
    else if (a === "--json-only") jsonOnly = true;
  }
  const toRun = ALL_CHECKS.filter((c) => !only || only.has(c.id));
  const results: CheckResult[] = [];
  for (const c of toRun) {
    if (!jsonOnly) process.stdout.write(`[verify] ${c.id}… `);
    const r = await runCheck(c.id, c.name, c.fn);
    results.push(r);
    if (!jsonOnly) {
      const icon = r.status === "ok" ? "OK" : r.status === "warn" ? "WARN" : r.status === "fail" ? "FAIL" : "SKIP";
      process.stdout.write(`${icon} (${r.gaps.length} gap, ${r.durationMs}ms)\n`);
    }
  }
  await fs.mkdir(OUT_DIR, { recursive: true });
  const json = { generatedAt: new Date().toISOString(), checks: results, summary: { total: results.length, ok: results.filter((r) => r.status === "ok").length, warn: results.filter((r) => r.status === "warn").length, fail: results.filter((r) => r.status === "fail").length, skipped: results.filter((r) => r.status === "skipped").length, totalGaps: results.reduce((acc, r) => acc + r.gaps.length, 0) } };
  await fs.writeFile(REPORT_JSON, JSON.stringify(json, null, 2));
  await fs.writeFile(REPORT_MD, renderMd(results));
  if (!jsonOnly) { process.stdout.write(`\nReport scritto in:\n  ${path.relative(ROOT, REPORT_MD)}\n  ${path.relative(ROOT, REPORT_JSON)}\n`); }
  const hasFail = results.some((r) => r.status === "fail");
  const hasCritical = results.some((r) => r.gaps.some((g) => g.severity === "critical" || g.severity === "high"));
  process.exit(hasFail || hasCritical ? 1 : 0);
}
main().catch((err) => { console.error("[verify] uncaught:", err); process.exit(2); });
