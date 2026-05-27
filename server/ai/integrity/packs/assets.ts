// Task #2537 — Assets family checks.
import path from "path";
import type { AppIntegrityCheck } from "../types";
import { walkFiles, readSafe, pathExists } from "../fs-helpers";

const IMG_EXTS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".ico"];
const OVERSIZE_KB = 800; // ~800KB warning threshold

const missingFiles: AppIntegrityCheck = {
  id: "assets/missing-files",
  family: "assets",
  name: "Asset referenziato ma file inesistente",
  severity: "high",
  cost: "medium",
  description: "Path `assets/...` (in qualunque .ts/.tsx/.json/.html/.md) che punta a file mancanti.",
  async query(ctx) {
    const files = await walkFiles(ctx.projectRoot, { extensions: [".ts", ".tsx", ".json", ".html", ".md"] });
    const re = /["'`]([a-zA-Z0-9._\-@/]*assets\/[a-zA-Z0-9._\-/@]+\.(?:png|jpg|jpeg|webp|gif|svg|ico))["'`]/g;
    const hits: { pk: string; data: Record<string, unknown> }[] = [];
    const seen = new Set<string>();
    for (const f of files) {
      const txt = await readSafe(f.absPath);
      if (!txt) continue;
      let m: RegExpExecArray | null;
      while ((m = re.exec(txt))) {
        let p = m[1];
        if (p.startsWith("./")) p = p.slice(2);
        if (p.startsWith("/")) p = p.slice(1);
        if (p.startsWith("@/")) p = p.slice(2);
        const key = `${f.relPath}::${p}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const abs = path.join(ctx.projectRoot, p);
        if (!(await pathExists(abs))) {
          hits.push({ pk: `${f.relPath}:${p}`, data: { file: f.relPath, missingAsset: p } });
        }
      }
      re.lastIndex = 0;
    }
    return { ok: hits.length === 0, count: hits.length, sample: hits.slice(0, 10) };
  },
};

const oversizedImages: AppIntegrityCheck = {
  id: "assets/oversized-images",
  family: "assets",
  name: `Immagini > ${OVERSIZE_KB}KB`,
  severity: "low",
  cost: "cheap",
  description: "Immagini in assets/ oltre la soglia: suggerimento di ottimizzazione (sharp/webp).",
  async query(ctx) {
    const files = await walkFiles(ctx.projectRoot, { extensions: IMG_EXTS, includeDirs: ["assets"] });
    const hits = files
      .filter((f) => f.size > OVERSIZE_KB * 1024)
      .sort((a, b) => b.size - a.size)
      .slice(0, 50)
      .map((f) => ({ pk: f.relPath, data: { path: f.relPath, sizeKb: Math.round(f.size / 1024) } }));
    return { ok: hits.length === 0, count: hits.length, sample: hits.slice(0, 10) };
  },
};

const appIconPresence: AppIntegrityCheck = {
  id: "assets/app-icon-presence",
  family: "assets",
  name: "Icona app presente",
  severity: "high",
  cost: "cheap",
  description: "app.json deve referenziare un icon esistente.",
  async query(ctx) {
    const txt = await readSafe(path.join(ctx.projectRoot, "app.json"));
    if (!txt) return { ok: true, count: 0, sample: [] };
    type AppJson = {
      expo?: {
        icon?: string;
        ios?: { icon?: string };
        android?: { icon?: string; adaptiveIcon?: { foregroundImage?: string } };
      };
    };
    let appj: AppJson | null = null;
    try { appj = JSON.parse(txt) as AppJson; } catch { return { ok: true, count: 0, sample: [] }; }
    const hits: { pk: string; data: Record<string, unknown> }[] = [];
    const candidates: Array<[string, string | undefined]> = [
      ["expo.icon", appj?.expo?.icon],
      ["expo.ios.icon", appj?.expo?.ios?.icon],
      ["expo.android.icon", appj?.expo?.android?.icon],
      ["expo.android.adaptiveIcon.foregroundImage", appj?.expo?.android?.adaptiveIcon?.foregroundImage],
    ];
    for (const [k, v] of candidates) {
      if (!v) continue;
      const p = v.replace(/^\.\//, "");
      const abs = path.join(ctx.projectRoot, p);
      if (!(await pathExists(abs))) hits.push({ pk: k, data: { key: k, missing: v } });
    }
    return { ok: hits.length === 0, count: hits.length, sample: hits };
  },
};

const duplicateAssets: AppIntegrityCheck = {
  id: "assets/duplicate-by-name",
  family: "assets",
  name: "Asset duplicati per nome (dimensioni diverse)",
  severity: "low",
  cost: "cheap",
  description: "Più file con lo stesso basename in cartelle diverse.",
  async query(ctx) {
    const files = await walkFiles(ctx.projectRoot, { extensions: IMG_EXTS, includeDirs: ["assets"] });
    const map = new Map<string, string[]>();
    for (const f of files) {
      const base = path.basename(f.relPath);
      const arr = map.get(base) ?? []; arr.push(f.relPath); map.set(base, arr);
    }
    const dups: { pk: string; data: Record<string, unknown> }[] = [];
    for (const [b, arr] of map.entries()) {
      if (arr.length > 1) dups.push({ pk: b, data: { basename: b, paths: arr } });
    }
    return { ok: dups.length === 0, count: dups.length, sample: dups.slice(0, 10) };
  },
};

const responsiveSmMissing: AppIntegrityCheck = {
  id: "assets/responsive-sm-missing",
  family: "assets",
  name: "Variante `-sm.webp` mancante",
  severity: "low",
  cost: "cheap",
  description: "Per regola di replit.md: ogni .webp in assets/images/ deve avere una variante `-sm.webp`.",
  async query(ctx) {
    const files = await walkFiles(ctx.projectRoot, { extensions: [".webp"], includeDirs: ["assets/images"] });
    const hits: { pk: string; data: Record<string, unknown> }[] = [];
    for (const f of files) {
      if (f.relPath.endsWith("-sm.webp")) continue;
      const sm = f.relPath.replace(/\.webp$/, "-sm.webp");
      if (!(await pathExists(path.join(ctx.projectRoot, sm)))) {
        hits.push({ pk: sm, data: { source: f.relPath, missingVariant: sm } });
      }
    }
    return { ok: hits.length === 0, count: hits.length, sample: hits.slice(0, 10) };
  },
};

const emptyAssetDir: AppIntegrityCheck = {
  id: "assets/empty-asset-dir",
  family: "assets",
  name: "Sotto-cartelle vuote in assets/",
  severity: "low",
  cost: "cheap",
  description: "Cartelle in assets/ senza file (potenzialmente residui di una pulizia).",
  async query(ctx) {
    const all = await walkFiles(ctx.projectRoot, { includeDirs: ["assets"] });
    const dirs = new Set<string>();
    for (const f of all) {
      const d = path.dirname(f.relPath);
      if (d !== "." && d.startsWith("assets")) dirs.add(d);
    }
    return { ok: dirs.size > 0 || all.length > 0, count: 0, sample: [], details: { assetDirCount: dirs.size, assetFileCount: all.length } };
  },
};

const pack: AppIntegrityCheck[] = [
  missingFiles, oversizedImages, appIconPresence,
  duplicateAssets, responsiveSmMissing, emptyAssetDir,
];
export default pack;
