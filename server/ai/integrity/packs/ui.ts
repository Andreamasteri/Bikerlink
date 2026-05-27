// Task #2537 — UI family checks. Screens + asset references + nav targets.
import path from "path";
import type { AppIntegrityCheck } from "../types";
import { walkFiles, readSafe, pathExists } from "../fs-helpers";

const TSX = [".tsx"];

async function listScreens(root: string) {
  const files = await walkFiles(root, { extensions: TSX, includeDirs: ["app"] });
  return files.filter((f) =>
    !f.relPath.endsWith("_layout.tsx") &&
    !/\/components?\//.test(f.relPath) &&
    !/\/__tests?__\//.test(f.relPath)
  );
}

function screenRouteFromPath(rel: string): string {
  // app/foo/bar.tsx -> /foo/bar ; app/(tabs)/index.tsx -> /
  let p = rel.replace(/^app\//, "/").replace(/\.tsx$/, "");
  p = p.replace(/\/index$/, "/");
  p = p.replace(/\/\([^)]+\)/g, "");
  if (p !== "/") p = p.replace(/\/$/, "");
  return p || "/";
}

const orphanScreen: AppIntegrityCheck = {
  id: "ui/orphan-screen",
  family: "ui",
  name: "Screen non raggiungibile da navigazione",
  severity: "medium",
  cost: "medium",
  description: "File `app/**/*.tsx` mai referenziato da `router.push`, `<Link>` o tab.",
  async query(ctx) {
    const screens = await listScreens(ctx.projectRoot);
    const refFiles = await walkFiles(ctx.projectRoot, { extensions: [".ts", ".tsx"], includeDirs: ["app", "components", "hooks", "lib"] });
    const allText = (await Promise.all(refFiles.map((f) => readSafe(f.absPath)))).join("\n");
    const orphans: { pk: string; data: Record<string, unknown> }[] = [];
    for (const s of screens) {
      const route = screenRouteFromPath(s.relPath);
      const base = path.basename(s.relPath, ".tsx");
      // Cerchiamo riferimenti al path o al nome del file
      const re1 = new RegExp(`["'\`]${route.replace(/[/\\^$+?.()|[\]{}]/g, "\\$&")}["'\`]`);
      const re2 = new RegExp(`["'\`]${base}["'\`]`);
      // Index/layout sono reachable per definizione
      if (base === "index" || s.relPath.includes("(tabs)") || s.relPath.endsWith("_layout.tsx")) continue;
      if (!re1.test(allText) && !re2.test(allText)) {
        orphans.push({ pk: s.relPath, data: { path: s.relPath, suggestedRoute: route } });
      }
    }
    return { ok: orphans.length === 0, count: orphans.length, sample: orphans.slice(0, 10) };
  },
};

const missingScreenFile: AppIntegrityCheck = {
  id: "ui/missing-screen-file",
  family: "ui",
  name: "Screen registrato in _layout senza file",
  severity: "high",
  cost: "cheap",
  description: "`<Stack.Screen name=\"x\">` o `<Tabs.Screen name=\"x\">` registrato in `_layout.tsx` senza file corrispondente.",
  async query(ctx) {
    const layouts = await walkFiles(ctx.projectRoot, { extensions: TSX, includeDirs: ["app"] });
    const hits: { pk: string; data: Record<string, unknown> }[] = [];
    const re = /<(?:Stack|Tabs|NativeTabs|Stack\.Screen|Tabs\.Screen)\.Screen\s+name=["']([^"']+)["']/g;
    for (const layout of layouts.filter((f) => f.relPath.endsWith("_layout.tsx"))) {
      const txt = await readSafe(layout.absPath);
      if (!txt) continue;
      const dir = path.dirname(layout.absPath);
      let m: RegExpExecArray | null;
      while ((m = re.exec(txt))) {
        const name = m[1];
        const candidates = [
          path.join(dir, `${name}.tsx`),
          path.join(dir, name, "index.tsx"),
          path.join(dir, name, "_layout.tsx"),
        ];
        let found = false;
        for (const c of candidates) { if (await pathExists(c)) { found = true; break; } }
        if (!found) hits.push({ pk: `${layout.relPath}:${name}`, data: { layout: layout.relPath, screenName: name } });
      }
      re.lastIndex = 0;
    }
    return { ok: hits.length === 0, count: hits.length, sample: hits.slice(0, 10) };
  },
};

const missingAssetRef: AppIntegrityCheck = {
  id: "ui/missing-asset-ref",
  family: "ui",
  name: "Asset referenziato ma file mancante",
  severity: "high",
  cost: "medium",
  description: "`require('@/assets/...')` o `require('./assets/...')` che punta a file non esistente.",
  async query(ctx) {
    const files = await walkFiles(ctx.projectRoot, { extensions: [".ts", ".tsx"], includeDirs: ["app", "components", "hooks", "lib"] });
    const re = /require\s*\(\s*["'`]([^"'`]+(?:\.png|\.jpg|\.jpeg|\.webp|\.gif|\.svg))["'`]\s*\)/g;
    const hits: { pk: string; data: Record<string, unknown> }[] = [];
    for (const f of files) {
      const txt = await readSafe(f.absPath);
      if (!txt) continue;
      let m: RegExpExecArray | null;
      while ((m = re.exec(txt))) {
        const p = m[1];
        let abs: string;
        if (p.startsWith("@/")) abs = path.join(ctx.projectRoot, p.slice(2));
        else if (p.startsWith(".")) abs = path.resolve(path.dirname(f.absPath), p);
        else continue;
        if (!(await pathExists(abs))) {
          hits.push({ pk: `${f.relPath}:${p}`, data: { file: f.relPath, missingAsset: p } });
        }
      }
      re.lastIndex = 0;
    }
    return { ok: hits.length === 0, count: hits.length, sample: hits.slice(0, 10) };
  },
};

const navTargetMissing: AppIntegrityCheck = {
  id: "ui/nav-target-missing",
  family: "ui",
  name: "router.push verso route inesistente",
  severity: "high",
  cost: "medium",
  description: "Chiamata `router.push('/x/y')` o `<Link href='/x/y'>` verso path senza screen corrispondente.",
  async query(ctx) {
    const screens = await listScreens(ctx.projectRoot);
    const routes = new Set(screens.map((s) => screenRouteFromPath(s.relPath)));
    routes.add("/");
    const files = await walkFiles(ctx.projectRoot, { extensions: [".ts", ".tsx"], includeDirs: ["app", "components", "hooks", "lib"] });
    const re = /(?:router\.(?:push|replace|navigate)|<Link[^>]*?href=)\s*[\(=]\s*["'`](\/[^"'`?]+)["'`]/g;
    const hits: { pk: string; data: Record<string, unknown> }[] = [];
    for (const f of files) {
      const txt = await readSafe(f.absPath);
      if (!txt) continue;
      let m: RegExpExecArray | null;
      while ((m = re.exec(txt))) {
        const target = m[1].replace(/\/$/, "") || "/";
        // accetta match parziale (route con parametri)
        const normalized = target.replace(/\/[A-Za-z0-9_-]+$/, "/[id]");
        if (!routes.has(target) && !routes.has(normalized)) {
          const matchedAsPrefix = Array.from(routes).some((r) => target.startsWith(r + "/") || target === r);
          if (!matchedAsPrefix) {
            hits.push({ pk: `${f.relPath}:${target}`, data: { file: f.relPath, target } });
          }
        }
      }
      re.lastIndex = 0;
    }
    return { ok: hits.length === 0, count: hits.length, sample: hits.slice(0, 10) };
  },
};

const emptyScreenFile: AppIntegrityCheck = {
  id: "ui/empty-screen-file",
  family: "ui",
  name: "Screen file vuoto o senza default export",
  severity: "medium",
  cost: "cheap",
  description: "File screen in app/ senza `export default` (rotto al runtime di Expo Router).",
  async query(ctx) {
    const screens = await listScreens(ctx.projectRoot);
    const hits: { pk: string; data: Record<string, unknown> }[] = [];
    for (const s of screens) {
      const txt = await readSafe(s.absPath);
      if (!txt) continue;
      if (!/export\s+default\b/.test(txt)) {
        hits.push({ pk: s.relPath, data: { path: s.relPath, sizeBytes: s.size } });
      }
    }
    return { ok: hits.length === 0, count: hits.length, sample: hits.slice(0, 10) };
  },
};

const duplicateScreenRoute: AppIntegrityCheck = {
  id: "ui/duplicate-screen-route",
  family: "ui",
  name: "Screen con stesso route path",
  severity: "high",
  cost: "cheap",
  description: "Due file in `app/` che producono lo stesso route (es. nestings inconsistenti).",
  async query(ctx) {
    const screens = await listScreens(ctx.projectRoot);
    const map = new Map<string, string[]>();
    for (const s of screens) {
      const r = screenRouteFromPath(s.relPath);
      const arr = map.get(r) ?? []; arr.push(s.relPath); map.set(r, arr);
    }
    const dups: { pk: string; data: Record<string, unknown> }[] = [];
    for (const [r, arr] of map.entries()) {
      if (arr.length > 1) dups.push({ pk: r, data: { route: r, files: arr } });
    }
    return { ok: dups.length === 0, count: dups.length, sample: dups.slice(0, 10) };
  },
};

const pack: AppIntegrityCheck[] = [
  orphanScreen,
  missingScreenFile,
  missingAssetRef,
  navTargetMissing,
  emptyScreenFile,
  duplicateScreenRoute,
];
export default pack;
