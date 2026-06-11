/**
 * Task #2566 — Verifica Finale Integrazione Matching System.
 *
 * Script idempotente, riusabile, che esegue una serie di check incrociati
 * sul sistema di matching e produce un report `.local/verification/verification-report.{md,json}`.
 *
 * Usage:
 *   npx tsx scripts/verify-matching-integration.ts                # esegue tutti i check
 *   npx tsx scripts/verify-matching-integration.ts --check=registry,schema
 *   npx tsx scripts/verify-matching-integration.ts --json-only    # solo output JSON
 *
 * I gap NON sono auto-corretti: lo script è puramente diagnostico.
 * Per fix automatici aprire ticket dedicati (vedi report → "Suggerimenti").
 *
 * Scope intenzionale (vedi commit message #2566):
 *  - Check 1 Registry vs Schema (tabelle + colonne match_preferences)
 *  - Check 2 Registry vs Preferences columns
 *  - Check 3 Registry vs UI (grep match-control / match-health / matching-hub)
 *  - Check 4 Registry vs Manuale (grep server/site, content manuale)
 *  - Check 5 Npm packages declared in .local/tasks/*.md vs package.json
 *  - Check 6 i18n coverage IT vs EN (top-level keys)
 *  - Check 7 Endpoint admin: presenza di middleware admin sui file route
 *  - Check 8 replit.md: sezioni attese per cambi architetturali principali
 *
 * Check fuori scope di questo task (proposti come follow-up):
 *  - UI admin dedicata "Verifica Integrazione"
 *  - Esecuzione cron notturna via BullMQ
 *  - Auto-fix in place (i18n stubs, bump versioni)
 *  - Endpoint POST /api/admin/verify/* e generazione task PROPOSED
 */
import { promises as fs } from "node:fs";
import * as path from "node:path";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, ".local", "verification");
const REPORT_MD = path.join(OUT_DIR, "verification-report.md");
const REPORT_JSON = path.join(OUT_DIR, "verification-report.json");

type Severity = "critical" | "high" | "medium" | "low" | "info";

interface Gap {
  severity: Severity;
  check: string;
  what: string;
  where?: string;
  suggestion?: string;
}

interface CheckResult {
  id: string;
  name: string;
  status: "ok" | "warn" | "fail" | "skipped";
  gaps: Gap[];
  meta?: Record<string, unknown>;
  durationMs: number;
}

const sevOrder: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

async function readFileSafe(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, "utf8");
  } catch {
    return null;
  }
}

async function listFiles(dir: string, exts: string[]): Promise<string[]> {
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

async function runCheck(
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

// ─────────────────────────────────────────────────────────────────────────
// Check 1 — Registry vs Schema (tabelle dichiarate)
// ─────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────
// Check 2 — Registry vs match_preferences columns
// ─────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────
// Check 3 — Registry vs UI references
// ─────────────────────────────────────────────────────────────────────────
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
    // Le voci affinity-only (table === null) non richiedono un controllo UI.
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

// ─────────────────────────────────────────────────────────────────────────
// Check 4 — Registry vs Manuale (sito + pagine matching)
// ─────────────────────────────────────────────────────────────────────────
async function checkRegistryVsManual() {
  const { MATCHING_REGISTRY } = await import("../shared/matching-registry");
  // Cerca riferimenti nei file del sito / manuale / contenuti markdown.
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

// ─────────────────────────────────────────────────────────────────────────
// Check 5 — Npm packages dichiarati nei task vs package.json
// ─────────────────────────────────────────────────────────────────────────
async function checkPackages() {
  const pkgRaw = await readFileSafe(path.join(ROOT, "package.json"));
  if (!pkgRaw) return { status: "skipped" as const, gaps: [], meta: { reason: "package.json not found" } };
  const pkg = JSON.parse(pkgRaw);
  const installed = new Set<string>([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ]);
  // Falsi positivi #2581: i pacchetti elencati negli "overrides" (o "resolutions")
  // possono non comparire come dependency diretta ma sono comunque versioni gestite.
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
  const declared = new Map<string, string[]>(); // package -> task files
  // Falsi positivi #2581: estrai SOLO dalle sezioni dichiarative ("## Versioni e
  // compatibilità" oppure "## npm da installare"); le altre menzioni in changelog
  // o note storiche non rappresentano una richiesta di installazione.
  const ALLOWED_SECTIONS = /^##\s+(versioni\s+e\s+compatibilit[àa]|npm\s+da\s+installare)\b/i;
  const SECTION_BOUNDARY = /^##\s+/;
  const re = /`([a-z0-9._-]+(?:\/[a-z0-9._-]+)?)@\^[\d.]+`/gi;
  for (const f of taskFiles) {
    const c = await readFileSafe(f);
    if (!c) continue;
    // Estrai i blocchi sezione interessanti
    const lines = c.split(/\r?\n/);
    const buckets: string[] = [];
    let active: string[] | null = null;
    for (const ln of lines) {
      if (SECTION_BOUNDARY.test(ln)) {
        if (active) {
          buckets.push(active.join("\n"));
          active = null;
        }
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
    if (installed.has(name)) continue;
    if (overrideNames.has(name)) continue; // gestito da overrides/resolutions
    gaps.push({
      severity: "high",
      check: "packages",
      what: `Package '${name}' dichiarato nei task ma NON installato`,
      where: sources.slice(0, 3).join(", ") + (sources.length > 3 ? ` (+${sources.length - 3})` : ""),
      suggestion: `Installare con il packager tool oppure rimuovere riferimento dai task`,
    });
  }
  return {
    status: gaps.length ? ("warn" as const) : ("ok" as const),
    gaps,
    meta: {
      declaredCount: declared.size,
      installedCount: installed.size,
      overrideCount: overrideNames.size,
      taskFilesScanned: taskFiles.length,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Check 6 — i18n coverage IT vs EN (top-level keys)
// ─────────────────────────────────────────────────────────────────────────
async function checkI18n() {
  const itPath = path.join(ROOT, "lib/i18n/it.ts");
  const enPath = path.join(ROOT, "lib/i18n/en.ts");
  const it = await readFileSafe(itPath);
  const en = await readFileSafe(enPath);
  if (!it || !en) {
    return {
      status: "skipped" as const,
      gaps: [
        {
          severity: "info" as const,
          check: "i18n",
          what: "Lingue it.ts/en.ts non trovate in lib/i18n",
        },
      ],
      meta: {},
    };
  }
  // Top-level keys: estrai pattern ^  key: o "key":
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
  for (const k of itKeys) {
    if (!enKeys.has(k)) {
      gaps.push({
        severity: "low",
        check: "i18n",
        what: `Chiave i18n '${k}' presente in IT ma assente in EN`,
        suggestion: "Aggiungere traduzione (placeholder __TODO__ accettabile)",
      });
    }
  }
  for (const k of enKeys) {
    if (!itKeys.has(k)) {
      gaps.push({
        severity: "low",
        check: "i18n",
        what: `Chiave i18n '${k}' presente in EN ma assente in IT`,
        suggestion: "Aggiungere traduzione italiana",
      });
    }
  }
  return {
    status: gaps.length ? ("warn" as const) : ("ok" as const),
    gaps,
    meta: { itKeyCount: itKeys.size, enKeyCount: enKeys.size, diffCount: gaps.length },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Check 7 — Endpoint admin: middleware admin presente
// ─────────────────────────────────────────────────────────────────────────
async function checkAdminEndpoints() {
  const adminDir = path.join(ROOT, "server", "routes", "admin");
  const files = await listFiles(adminDir, [".ts"]).catch(() => []);
  const fileSet = new Set(files);

  // Falsi positivi #2581: la maggior parte dei sub-router admin è montata da
  // `server/routes/admin.ts` (oppure `server/routes/admin/index.ts`) tramite
  // `router.use(<path>, _requireAdmin, xRouter)`. Quei file ereditano la
  // guardia dal parent e non devono essere segnalati. Segnaliamo HIGH solo i
  // file route con mount diretto su `app` (senza middleware admin).
  //
  // Calcoliamo ricorsivamente la "chiusura protetta": partendo da admin.ts come
  // radice protetta, ogni sub-router montato con `_requireAdmin` viene marcato
  // protetto e visitato a sua volta per risolvere le sue mount.
  type ParsedRouter = {
    imports: Map<string, string>;
    mounts: Array<{ symbol: string; hasGuard: boolean }>;
    rootGuard: boolean;
  };
  const parseCache = new Map<string, ParsedRouter | null>();
  const parseRouterFile = async (filePath: string): Promise<ParsedRouter | null> => {
    if (parseCache.has(filePath)) return parseCache.get(filePath)!;
    const src = await readFileSafe(filePath);
    if (!src) {
      parseCache.set(filePath, null);
      return null;
    }
    const dir = path.dirname(filePath);
    const imports = new Map<string, string>();
    const importRe = /import\s+(\w+)\s+from\s+['"](\.[^'"]+)['"]/g;
    let im: RegExpExecArray | null;
    while ((im = importRe.exec(src)) !== null) {
      const sym = im[1];
      const rel = im[2];
      const base = path.resolve(dir, rel);
      for (const tp of [base + ".ts", path.join(base, "index.ts")]) {
        if (fileSet.has(tp) || tp === path.join(ROOT, "server", "routes", "admin.ts")) {
          imports.set(sym, tp);
          break;
        }
        // Anche router non sotto admin/ possono essere referenziati ma non li
        // tracciamo (es. mediaLibrary in server/routes/media-library.ts).
      }
    }
    const rootGuard = /router\.use\(\s*_requireAdmin\s*\)/.test(src);
    const mounts: Array<{ symbol: string; hasGuard: boolean }> = [];
    // router.use('<path>', _requireAdmin, xRouter)  o  router.use('<path>', xRouter)
    const mountRe = /router\.use\(\s*['"][^'"]*['"]\s*,\s*([^)]+)\)/g;
    let mm: RegExpExecArray | null;
    while ((mm = mountRe.exec(src)) !== null) {
      const args = mm[1];
      const hasGuard = /_requireAdmin|requireAdmin\b/.test(args);
      for (const sym of args.split(",").map((s) => s.trim())) {
        if (/^[A-Za-z_]\w*$/.test(sym)) mounts.push({ symbol: sym, hasGuard });
      }
    }
    const parsed = { imports, mounts, rootGuard };
    parseCache.set(filePath, parsed);
    return parsed;
  };

  const protectedFiles = new Set<string>();
  const adminTs = path.join(ROOT, "server", "routes", "admin.ts");
  const adminIndex = path.join(ROOT, "server", "routes", "admin", "index.ts");
  const queue: string[] = [];
  for (const root of [adminTs, adminIndex]) {
    if (await readFileSafe(root)) {
      protectedFiles.add(root);
      queue.push(root);
    }
  }
  while (queue.length) {
    const cur = queue.shift()!;
    const parsed = await parseRouterFile(cur);
    if (!parsed) continue;
    for (const { symbol, hasGuard } of parsed.mounts) {
      if (!hasGuard && !parsed.rootGuard) continue;
      const target = parsed.imports.get(symbol);
      if (!target) continue;
      if (protectedFiles.has(target)) continue;
      protectedFiles.add(target);
      queue.push(target);
    }
  }

  // Scan dei mount diretti su `app` per identificare file route esposti
  // direttamente senza passare per il router admin.
  const entrypoints = [
    path.join(ROOT, "server", "routes.ts"),
    path.join(ROOT, "server", "index.ts"),
  ];
  // file path -> { hasGuard: bool, mountPath: string }
  const appMounts = new Map<string, { hasGuard: boolean; mountPath: string }>();
  for (const ep of entrypoints) {
    const src = await readFileSafe(ep);
    if (!src) continue;
    const dir = path.dirname(ep);
    const imports = new Map<string, string>();
    const importRe = /import\s+(?:(\w+)|\{\s*([^}]+)\s*\})\s+from\s+['"](\.[^'"]+)['"]/g;
    let im: RegExpExecArray | null;
    while ((im = importRe.exec(src)) !== null) {
      const rel = im[3];
      const base = path.resolve(dir, rel);
      const resolved =
        [base + ".ts", path.join(base, "index.ts")].find((p) => fileSet.has(p)) ?? null;
      if (!resolved) continue;
      if (im[1]) imports.set(im[1], resolved);
      if (im[2]) {
        for (const part of im[2].split(",").map((s) => s.trim())) {
          const sym = part.split(/\s+as\s+/i).pop()!.trim();
          if (sym) imports.set(sym, resolved);
        }
      }
    }
    const appRe = /app\.use\(\s*['"]([^'"]+)['"]\s*,\s*([^)]+)\)/g;
    let am: RegExpExecArray | null;
    while ((am = appRe.exec(src)) !== null) {
      const mountPath = am[1];
      const args = am[2];
      const hasGuard = /_requireAdmin|requireAdmin\b/.test(args);
      for (const sym of args.split(",").map((s) => s.trim())) {
        const resolved = imports.get(sym);
        if (!resolved) continue;
        const prev = appMounts.get(resolved);
        // Se almeno un mount ha la guard, consideriamo coperto.
        if (!prev || (hasGuard && !prev.hasGuard)) {
          appMounts.set(resolved, { hasGuard, mountPath });
        }
      }
    }
  }

  const gaps: Gap[] = [];
  let checkedCount = 0;
  for (const f of files) {
    const c = await readFileSafe(f);
    if (!c) continue;
    if (!/Router\(|router\.(get|post|put|patch|delete)/i.test(c)) continue;
    checkedCount++;
    const hasAdminGuard = /_requireAdmin|requireAdmin|isAdmin|adminMiddleware|adminOnly/i.test(c);
    if (hasAdminGuard) continue;
    if (protectedFiles.has(f)) continue; // protetto per ereditarietà dal parent
    const direct = appMounts.get(f);
    if (direct && !direct.hasGuard) {
      gaps.push({
        severity: "high",
        check: "admin-endpoints",
        what: `Route admin con mount diretto su 'app' (${direct.mountPath}) senza middleware admin`,
        where: path.relative(ROOT, f),
        suggestion:
          "Aggiungere _requireAdmin al mount in server/routes.ts oppure router.use(_requireAdmin) in cima al file",
      });
    }
    // Negli altri casi (router montato da sub-router non protetto) non
    // segnaliamo per evitare i falsi positivi descritti nel task #2581.
  }
  return {
    status: gaps.length ? ("warn" as const) : ("ok" as const),
    gaps,
    meta: {
      adminRouteFiles: files.length,
      adminRouteFilesChecked: checkedCount,
      protectedByParent: protectedFiles.size,
      directAppMounts: appMounts.size,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Check 8 — replit.md: sezioni attese
// ─────────────────────────────────────────────────────────────────────────
async function checkReplitMd() {
  const md = await readFileSafe(path.join(ROOT, "replit.md"));
  if (!md) return { status: "fail" as const, gaps: [{ severity: "high" as const, check: "replit-md", what: "replit.md mancante" }], meta: {} };
  const expectedSections = [
    "Redis",
    "Embeddings",
    "Preferenze Negative",
    "Sistema OTA",
    "A/B Testing",
  ];
  const gaps: Gap[] = [];
  for (const s of expectedSections) {
    if (!new RegExp(s, "i").test(md)) {
      gaps.push({
        severity: "low",
        check: "replit-md",
        what: `Sezione attesa '${s}' non trovata in replit.md`,
        suggestion: "Aggiungere sezione documentando il sotto-sistema",
      });
    }
  }
  return {
    status: gaps.length ? ("warn" as const) : ("ok" as const),
    gaps,
    meta: { expectedSections, length: md.length },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Runner
// ─────────────────────────────────────────────────────────────────────────
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

function parseArgs(argv: string[]): { only: Set<string> | null; jsonOnly: boolean } {
  let only: Set<string> | null = null;
  let jsonOnly = false;
  for (const a of argv) {
    if (a.startsWith("--check=")) only = new Set(a.slice("--check=".length).split(","));
    else if (a === "--json-only") jsonOnly = true;
  }
  return { only, jsonOnly };
}

function renderMd(results: CheckResult[]): string {
  const total = results.length;
  const ok = results.filter((r) => r.status === "ok").length;
  const warn = results.filter((r) => r.status === "warn").length;
  const fail = results.filter((r) => r.status === "fail").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const allGaps = results.flatMap((r) => r.gaps).sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);

  const lines: string[] = [];
  lines.push(`# Verifica Integrazione Matching System`);
  lines.push("");
  lines.push(`_Generato: ${new Date().toISOString()}_`);
  lines.push("");
  lines.push(`## Sommario`);
  lines.push("");
  lines.push(`- Check eseguiti: **${total}**`);
  lines.push(`- ✅ OK: **${ok}** · ⚠️ Warn: **${warn}** · ❌ Fail: **${fail}** · ⏭️ Skipped: **${skipped}**`);
  lines.push(`- Gap totali: **${allGaps.length}**`);
  lines.push("");
  const bySev: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const g of allGaps) bySev[g.severity]++;
  lines.push(`  - critical: ${bySev.critical}, high: ${bySev.high}, medium: ${bySev.medium}, low: ${bySev.low}, info: ${bySev.info}`);
  lines.push("");
  lines.push(`## Dettaglio per check`);
  lines.push("");
  for (const r of results) {
    const icon = r.status === "ok" ? "✅" : r.status === "warn" ? "⚠️" : r.status === "fail" ? "❌" : "⏭️";
    lines.push(`### ${icon} ${r.id} — ${r.name} _(${r.durationMs}ms)_`);
    if (r.meta) lines.push("```\n" + JSON.stringify(r.meta, null, 2) + "\n```");
    if (r.gaps.length === 0) {
      lines.push("_Nessun gap rilevato._");
    } else {
      for (const g of r.gaps) {
        lines.push(`- **[${g.severity}]** ${g.what}${g.where ? ` _(${g.where})_` : ""}`);
        if (g.suggestion) lines.push(`  - 💡 ${g.suggestion}`);
      }
    }
    lines.push("");
  }
  if (allGaps.length > 0) {
    lines.push(`## Gap aggregati per severity`);
    lines.push("");
    for (const sev of ["critical", "high", "medium", "low", "info"] as Severity[]) {
      const subset = allGaps.filter((g) => g.severity === sev);
      if (subset.length === 0) continue;
      lines.push(`### ${sev} (${subset.length})`);
      for (const g of subset) {
        lines.push(`- [${g.check}] ${g.what}${g.where ? ` — ${g.where}` : ""}`);
      }
      lines.push("");
    }
  }
  return lines.join("\n");
}

async function main() {
  const { only, jsonOnly } = parseArgs(process.argv.slice(2));
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
  const json = {
    generatedAt: new Date().toISOString(),
    checks: results,
    summary: {
      total: results.length,
      ok: results.filter((r) => r.status === "ok").length,
      warn: results.filter((r) => r.status === "warn").length,
      fail: results.filter((r) => r.status === "fail").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      totalGaps: results.reduce((acc, r) => acc + r.gaps.length, 0),
    },
  };
  await fs.writeFile(REPORT_JSON, JSON.stringify(json, null, 2));
  await fs.writeFile(REPORT_MD, renderMd(results));
  if (!jsonOnly) {
    process.stdout.write(`\nReport scritto in:\n  ${path.relative(ROOT, REPORT_MD)}\n  ${path.relative(ROOT, REPORT_JSON)}\n`);
  }
  // Exit code: 1 se almeno un check è "fail" o gap critical/high
  const hasFail = results.some((r) => r.status === "fail");
  const hasCritical = results.some((r) => r.gaps.some((g) => g.severity === "critical" || g.severity === "high"));
  process.exit(hasFail || hasCritical ? 1 : 0);
}

main().catch((err) => {
  console.error("[verify] uncaught:", err);
  process.exit(2);
});
