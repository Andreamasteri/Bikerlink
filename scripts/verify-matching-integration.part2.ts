import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { Gap } from "./verify-matching-integration";

const ROOT = process.cwd();

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

// ─────────────────────────────────────────────────────────────────────────
// Check 7 — Endpoint admin: middleware admin presente
// ─────────────────────────────────────────────────────────────────────────
export async function checkAdminEndpoints() {
  const adminDir = path.join(ROOT, "server", "routes", "admin");
  const files = await listFiles(adminDir, [".ts"]).catch(() => []);
  const fileSet = new Set(files);

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
      }
    }
    const rootGuard = /router\.use\(\s*_requireAdmin\s*\)/.test(src);
    const mounts: Array<{ symbol: string; hasGuard: boolean }> = [];
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

  const entrypoints = [
    path.join(ROOT, "server", "routes.ts"),
    path.join(ROOT, "server", "index.ts"),
  ];
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
    if (protectedFiles.has(f)) continue;
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
export async function checkReplitMd() {
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
