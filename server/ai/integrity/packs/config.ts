// Task #2537 — Config family checks.
import path from "path";
import type { AppIntegrityCheck } from "../types";
import { readSafe, pathExists } from "../fs-helpers";

async function readJson(root: string, rel: string): Promise<any | null> {
  const txt = await readSafe(path.join(root, rel));
  if (!txt) return null;
  try { return JSON.parse(txt); } catch { return null; }
}

const appJsonCoherence: AppIntegrityCheck = {
  id: "config/app-json-coherence",
  family: "config",
  name: "app.json e package.json coerenti su versione",
  severity: "medium",
  cost: "cheap",
  description: "La `version` in app.json (expo.version) deve coincidere con package.json.",
  async query(ctx) {
    const pkg = await readJson(ctx.projectRoot, "package.json");
    const appj = await readJson(ctx.projectRoot, "app.json");
    if (!pkg || !appj) return { ok: true, count: 0, sample: [], details: { skipped: "app.json o package.json mancante" } };
    const pkgV = pkg.version;
    const appV = appj?.expo?.version;
    if (pkgV && appV && pkgV !== appV) {
      return { ok: false, count: 1, sample: [{ pk: "version", data: { packageJson: pkgV, appJson: appV } }] };
    }
    return { ok: true, count: 0, sample: [] };
  },
};

const noAppConfigDynamic: AppIntegrityCheck = {
  id: "config/no-app-config-dynamic",
  family: "config",
  name: "Nessun app.config.ts/js (vietato dalla skill expo)",
  severity: "critical",
  cost: "cheap",
  description: "I config dinamici rompono Expo Launch. Usare solo app.json.",
  async query(ctx) {
    const hits: { pk: string; data: Record<string, unknown> }[] = [];
    for (const f of ["app.config.ts", "app.config.js", "app.config.mjs", "app.config.cjs"]) {
      if (await pathExists(path.join(ctx.projectRoot, f))) {
        hits.push({ pk: f, data: { file: f, message: "Migra a app.json e rimuovi" } });
      }
    }
    return { ok: hits.length === 0, count: hits.length, sample: hits };
  },
};

const replitMdPresent: AppIntegrityCheck = {
  id: "config/replit-md-present",
  family: "config",
  name: "replit.md presente e non vuoto",
  severity: "medium",
  cost: "cheap",
  description: "Il file `replit.md` deve esistere ed essere non vuoto (overview + user preferences).",
  async query(ctx) {
    const txt = await readSafe(path.join(ctx.projectRoot, "replit.md"));
    if (!txt) return { ok: false, count: 1, sample: [{ pk: "replit.md", data: { reason: "mancante" } }] };
    if (txt.length < 200) return { ok: false, count: 1, sample: [{ pk: "replit.md", data: { reason: "troppo corto", chars: txt.length } }] };
    return { ok: true, count: 0, sample: [] };
  },
};

const bundleIdStable: AppIntegrityCheck = {
  id: "config/bundle-id-stable",
  family: "config",
  name: "Bundle ID iOS/Android dichiarati",
  severity: "high",
  cost: "cheap",
  description: "app.json deve dichiarare ios.bundleIdentifier e android.package.",
  async query(ctx) {
    const appj = await readJson(ctx.projectRoot, "app.json");
    if (!appj) return { ok: true, count: 0, sample: [], details: { skipped: "app.json mancante" } };
    const hits: { pk: string; data: Record<string, unknown> }[] = [];
    if (!appj?.expo?.ios?.bundleIdentifier) hits.push({ pk: "ios.bundleIdentifier", data: { missing: "expo.ios.bundleIdentifier" } });
    if (!appj?.expo?.android?.package) hits.push({ pk: "android.package", data: { missing: "expo.android.package" } });
    return { ok: hits.length === 0, count: hits.length, sample: hits };
  },
};

const packageNameMatch: AppIntegrityCheck = {
  id: "config/package-name-match",
  family: "config",
  name: "Nome pacchetto coerente fra app.json e package.json",
  severity: "low",
  cost: "cheap",
  description: "Heuristic: app.json.expo.slug ⇄ package.json.name (informativo).",
  async query(ctx) {
    const pkg = await readJson(ctx.projectRoot, "package.json");
    const appj = await readJson(ctx.projectRoot, "app.json");
    if (!pkg || !appj) return { ok: true, count: 0, sample: [] };
    const slug = appj?.expo?.slug;
    const name = pkg?.name;
    if (slug && name && slug !== name && !slug.includes(name) && !name.includes(slug)) {
      return { ok: false, count: 1, sample: [{ pk: "slug", data: { slug, packageName: name } }] };
    }
    return { ok: true, count: 0, sample: [] };
  },
};

const runtimeVersionStrategy: AppIntegrityCheck = {
  id: "config/runtime-version-strategy",
  family: "config",
  name: "runtimeVersion dichiarato (richiesto per OTA)",
  severity: "high",
  cost: "cheap",
  description: "app.json deve contenere expo.runtimeVersion (string o policy) per supportare OTA correttamente.",
  async query(ctx) {
    const appj = await readJson(ctx.projectRoot, "app.json");
    if (!appj) return { ok: true, count: 0, sample: [] };
    const rv = appj?.expo?.runtimeVersion;
    if (rv === undefined || rv === null || rv === "") {
      return { ok: false, count: 1, sample: [{ pk: "expo.runtimeVersion", data: { missing: true } }] };
    }
    return { ok: true, count: 0, sample: [] };
  },
};

const pack: AppIntegrityCheck[] = [
  appJsonCoherence, noAppConfigDynamic, replitMdPresent,
  bundleIdStable, packageNameMatch, runtimeVersionStrategy,
];
export default pack;
