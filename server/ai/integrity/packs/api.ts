// Task #2537 — API family checks.
// Match route server (router.METHOD('/path')) vs chiamate client
// (apiRequest('/api/...'), useQuery(['/api/...'])).
import type { AppIntegrityCheck } from "../types";
import { walkFiles, readSafe } from "../fs-helpers";

const TS_EXTS = [".ts", ".tsx"];

interface RouteRef { method: string; path: string; file: string; line: number; }
interface ClientCall { path: string; file: string; line: number; }

async function scanServerRoutes(root: string): Promise<RouteRef[]> {
  const files = await walkFiles(root, { extensions: TS_EXTS, includeDirs: ["server/routes"] });
  const re = /router\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/g;
  const out: RouteRef[] = [];
  for (const f of files) {
    const txt = await readSafe(f.absPath);
    if (!txt) continue;
    let m: RegExpExecArray | null;
    while ((m = re.exec(txt))) {
      const idx = txt.slice(0, m.index).split("\n").length;
      out.push({ method: m[1].toUpperCase(), path: m[2], file: f.relPath, line: idx });
    }
    re.lastIndex = 0;
  }
  return out;
}

async function scanClientCalls(root: string): Promise<ClientCall[]> {
  const files = await walkFiles(root, { extensions: TS_EXTS, includeDirs: ["app", "components", "hooks", "lib"] });
  const re = /(?:apiRequest|fetch)\s*\(\s*(?:["'`]([A-Z]+)["'`]\s*,\s*)?["'`](\/api\/[^"'`?]+)["'`]/g;
  const qkRe = /queryKey\s*:\s*\[\s*["'`](\/api\/[^"'`?]+)["'`]/g;
  const out: ClientCall[] = [];
  for (const f of files) {
    const txt = await readSafe(f.absPath);
    if (!txt) continue;
    let m: RegExpExecArray | null;
    while ((m = re.exec(txt))) {
      const ln = txt.slice(0, m.index).split("\n").length;
      out.push({ path: m[2], file: f.relPath, line: ln });
    }
    re.lastIndex = 0;
    while ((m = qkRe.exec(txt))) {
      const ln = txt.slice(0, m.index).split("\n").length;
      out.push({ path: m[1], file: f.relPath, line: ln });
    }
    qkRe.lastIndex = 0;
  }
  return out;
}

// Normalizza un route path con :param e :param? a regex shape per match con client call
function routeMatches(serverPath: string, clientPath: string): boolean {
  // server può essere registrato con prefix /api/ in admin.ts; controlliamo suffix
  // strip prefix /api se presente
  const sp = serverPath.replace(/\/$/, "");
  const cp = clientPath.replace(/^\/api/, "").replace(/\/$/, "");
  // confronta parametri
  const re = "^" + sp.replace(/:[^/]+/g, "[^/]+") + "$";
  return new RegExp(re).test(cp) || sp === clientPath;
}

const routeWithoutClient: AppIntegrityCheck = {
  id: "api/route-without-client",
  family: "api",
  name: "Route server senza chiamate client",
  severity: "low",
  cost: "medium",
  description: "Route definite in server/routes/** che nessun client chiama. Possibili candidati alla rimozione o orfani da admin/script.",
  async query(ctx) {
    const routes = await scanServerRoutes(ctx.projectRoot);
    const clients = await scanClientCalls(ctx.projectRoot);
    const orphans: { pk: string; data: Record<string, unknown> }[] = [];
    for (const r of routes) {
      const hit = clients.some((c) => routeMatches(r.path, c.path));
      if (!hit) {
        orphans.push({ pk: `${r.method} ${r.path}`, data: { method: r.method, path: r.path, file: r.file, line: r.line } });
      }
    }
    return { ok: orphans.length === 0, count: orphans.length, sample: orphans.slice(0, 10), details: { totalRoutes: routes.length, totalClientCalls: clients.length } };
  },
};

const clientWithoutRoute: AppIntegrityCheck = {
  id: "api/client-without-route",
  family: "api",
  name: "Chiamate client a route inesistenti",
  severity: "high",
  cost: "medium",
  description: "apiRequest()/useQuery() che puntano a path /api/... non presenti nel server (probabili 404 in produzione).",
  async query(ctx) {
    const routes = await scanServerRoutes(ctx.projectRoot);
    const clients = await scanClientCalls(ctx.projectRoot);
    const offenders: { pk: string; data: Record<string, unknown> }[] = [];
    for (const c of clients) {
      const hit = routes.some((r) => routeMatches(r.path, c.path));
      if (!hit) {
        offenders.push({ pk: `${c.path} @ ${c.file}:${c.line}`, data: { path: c.path, file: c.file, line: c.line } });
      }
    }
    return { ok: offenders.length === 0, count: offenders.length, sample: offenders.slice(0, 10) };
  },
  explainHint: "Una chiamata a route mancante produce 404 in produzione: priorità alta.",
};

const duplicateRoutePaths: AppIntegrityCheck = {
  id: "api/duplicate-route-paths",
  family: "api",
  name: "Path route duplicati (stesso method)",
  severity: "high",
  cost: "cheap",
  description: "Due o più handler dichiarano lo stesso (METHOD, path). Comportamento dipende dall'ordine di registrazione.",
  async query(ctx) {
    const routes = await scanServerRoutes(ctx.projectRoot);
    const map = new Map<string, RouteRef[]>();
    for (const r of routes) {
      const k = `${r.method} ${r.path}`;
      const arr = map.get(k) ?? [];
      arr.push(r); map.set(k, arr);
    }
    const dups: { pk: string; data: Record<string, unknown> }[] = [];
    for (const [k, arr] of map.entries()) {
      if (arr.length > 1) {
        dups.push({ pk: k, data: { key: k, occurrences: arr.length, files: arr.map((r) => `${r.file}:${r.line}`) } });
      }
    }
    return { ok: dups.length === 0, count: dups.length, sample: dups.slice(0, 10) };
  },
};

const adminRouteWithoutGuard: AppIntegrityCheck = {
  id: "api/admin-route-without-guard",
  family: "api",
  name: "Route admin senza guard auth",
  severity: "critical",
  cost: "cheap",
  description: "File in server/routes/admin/** che non includono _requireAdmin/_requireAuth nel module-level mounting.",
  async query(ctx) {
    const files = await walkFiles(ctx.projectRoot, { extensions: [".ts"], includeDirs: ["server/routes/admin"] });
    const hits: { pk: string; data: Record<string, unknown> }[] = [];
    // Le route admin sono già protette al mount in routes/admin.ts via _requireAdmin.
    // Qui controlliamo che non sia stato accidentalmente creato un export Router
    // separato che bypassa il mount centrale (es. registrato altrove).
    const mountFile = await readSafe(`${ctx.projectRoot}/server/routes/admin.ts`);
    const mountText = mountFile ?? "";
    for (const f of files) {
      const base = f.relPath.replace(/^server\/routes\//, "./").replace(/\.ts$/, "");
      const referenced = mountText.includes(`from '${base}'`) || mountText.includes(`from "${base}"`);
      if (referenced || !f.relPath.endsWith(".ts") || f.relPath.endsWith("/index.ts")) continue;
      // Controlla anche se il parent directory ha un index.ts montato da admin.ts
      // (es. admin/maps/handler.ts è coperto se admin.ts monta admin/maps o admin/maps/index).
      const parentDir = base.replace(/\/[^/]+$/, ""); // ./admin/maps
      const parentIndexReferenced =
        mountText.includes(`from '${parentDir}'`) || mountText.includes(`from "${parentDir}"`) ||
        mountText.includes(`from '${parentDir}/index'`) || mountText.includes(`from "${parentDir}/index"`);
      if (parentIndexReferenced) continue;
      hits.push({ pk: f.relPath, data: { path: f.relPath, reason: "Router admin non importato da server/routes/admin.ts (verifica mount o rimuovi)" } });
    }
    return { ok: hits.length === 0, count: hits.length, sample: hits.slice(0, 10) };
  },
};

const routeWithoutErrorHandler: AppIntegrityCheck = {
  id: "api/route-without-error-handler",
  family: "api",
  name: "Handler route senza try/catch o sendError",
  severity: "medium",
  cost: "medium",
  description: "Heuristic: file route in cui un handler async non contiene `try` né `sendError`. Possibili 500 non gestiti.",
  async query(ctx) {
    const files = await walkFiles(ctx.projectRoot, { extensions: [".ts"], includeDirs: ["server/routes"] });
    const hits: { pk: string; data: Record<string, unknown> }[] = [];
    const handlerRe = /router\.(get|post|put|patch|delete)\s*\([^,]+,\s*async\s*\([^)]*\)\s*=>\s*\{([\s\S]*?)\n\}\)/g;
    for (const f of files) {
      const txt = await readSafe(f.absPath);
      if (!txt) continue;
      let m: RegExpExecArray | null;
      let bad = 0;
      while ((m = handlerRe.exec(txt))) {
        const body = m[2];
        if (!/\btry\b/.test(body) && !/\bsendError\b/.test(body) && !/\bres\.status\s*\(\s*[45]\d{2}\s*\)/.test(body)) {
          bad++;
        }
      }
      handlerRe.lastIndex = 0;
      if (bad > 0) hits.push({ pk: f.relPath, data: { path: f.relPath, unhandled: bad } });
    }
    return { ok: hits.length === 0, count: hits.length, sample: hits.slice(0, 10) };
  },
};

const paramsWithoutValidation: AppIntegrityCheck = {
  id: "api/params-without-validation",
  family: "api",
  name: "Body POST/PUT senza validazione Zod",
  severity: "medium",
  cost: "medium",
  description: "Heuristic: route POST/PUT che leggono `req.body` ma non usano `z.` (Zod) per validazione input.",
  async query(ctx) {
    const files = await walkFiles(ctx.projectRoot, { extensions: [".ts"], includeDirs: ["server/routes"] });
    const hits: { pk: string; data: Record<string, unknown> }[] = [];
    const re = /router\.(post|put|patch)\s*\([^,]+,(?:[^,]+,)?\s*async[^{]*\{([\s\S]*?)\n\}\)/g;
    for (const f of files) {
      const txt = await readSafe(f.absPath);
      if (!txt) continue;
      let m: RegExpExecArray | null;
      let bad = 0;
      while ((m = re.exec(txt))) {
        const body = m[2];
        if (/\breq\.body\b/.test(body) && !/\bz\.|\.safeParse\(|\.parse\(/.test(body)) bad++;
      }
      re.lastIndex = 0;
      if (bad > 0) hits.push({ pk: f.relPath, data: { path: f.relPath, unvalidatedHandlers: bad } });
    }
    return { ok: hits.length === 0, count: hits.length, sample: hits.slice(0, 10) };
  },
};

const pack: AppIntegrityCheck[] = [
  routeWithoutClient,
  clientWithoutRoute,
  duplicateRoutePaths,
  adminRouteWithoutGuard,
  routeWithoutErrorHandler,
  paramsWithoutValidation,
];
export default pack;
