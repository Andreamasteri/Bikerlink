/**
 * check-graphhopper-token.ts
 *
 * Verifica one-off (o schedulabile via cron) che rileva il DRIFT del token
 * GraphHopper tra la app e il ThinkCentre: il valore di GRAPHHOPPER_TOKEN
 * (secret Replit) inviato come header `X-GH-Token` deve combaciare con quello
 * hardcoded nella nginx del ThinkCentre. Se qualcuno ruota il token da un lato
 * senza aggiornare l'altro, ogni probe fallisce con un 403 che sembra un
 * generico "servizio down".
 *
 * Per ogni area di routing lo script interroga l'endpoint `/health` e, se questo
 * risponde 2xx, conferma anche un vero `/route` a due punti (profilo
 * `motorcycle`, via `ACTIVE_PROFILE`). Un `/health` verde ma un `/route` rotto
 * (grafo mancante, profilo errato, engine KO) NON è "ok": va reso esplicito,
 * altrimenti la guardia resta verde mentre il routing moto è di fatto rotto.
 * Classificazione:
 *   - ok            → /health 2xx E /route 2xx: il servizio instrada davvero
 *   - token-mismatch→ 401/403 (su /health o /route), token rifiutato (DRIFT)
 *   - route-broken  → /health 2xx ma /route fallisce (routing rotto)
 *   - unreachable   → timeout / errore di rete / 5xx / altro sul /health
 *
 * NON stampa mai il valore del token: solo un fingerprint SHA-256 a 8 caratteri.
 *
 * Uso:  npx tsx scripts/check-graphhopper-token.ts
 * Exit: 0 se tutte le aree raggiungibili instradano; 2 se rilevato token-mismatch;
 *       3 se nessuna area instrada; 4 se un'area risponde a /health ma non a /route.
 */

import { cfAccessHeaders } from "../server/lib/cf-access";
import {
  areaProbePoints,
  graphHopperRouteProbe,
} from "../server/routes/admin/thinkcentre-health-gh-probes";
import { tokenFingerprint } from "../server/routes/admin/thinkcentre-health-utils";
import { ROUTING_AREAS } from "../shared/routing-areas";

const PROBE_TIMEOUT_MS = 15_000;

type Verdict = "ok" | "token-mismatch" | "route-broken" | "unreachable";

interface AreaResult {
  codice: string;
  nome: string;
  verdict: Verdict;
  status: number | null;
  latencyMs: number | null;
  detail: string;
}

/** True se un messaggio d'errore del /route indica un 401/403 (token drift). */
function isAuthError(error: string | undefined): boolean {
  return !!error && /HTTP 40[13]\b/.test(error);
}

/**
 * True se il /route ha fallito solo perché il punto di probe cade fuori dalla
 * rete stradale (PointNotFoundException). NON è un engine rotto: significa che
 * il grafo è caricato e lo snapping ha girato davvero — cioè l'engine instrada
 * (più di un semplice heartbeat). Serve perché `areaProbePoints` deriva i punti
 * dal centro del bbox, che per alcune aree (mari, isole) cade fuori rete.
 * Un profilo errato o un engine KO danno invece messaggi diversi ("profile does
 * not exist", 5xx, ecc.) e restano correttamente classificati come route-broken.
 */
function isPointOffNetwork(error: string | undefined): boolean {
  return !!error && /PointNotFoundException|Cannot find point/i.test(error);
}

async function probeArea(
  base: string,
  headers: Record<string, string>,
  token: string | undefined,
  area: (typeof ROUTING_AREAS)[number],
): Promise<AreaResult> {
  const areaBase = `${base}${area.path}`;
  const url = `${areaBase}/health`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const t0 = Date.now();
  let healthLatency: number | null = null;
  try {
    const res = await fetch(url, { method: "GET", headers, signal: controller.signal });
    healthLatency = Date.now() - t0;
    if (res.status === 401 || res.status === 403) {
      return {
        codice: area.codice,
        nome: area.nome,
        verdict: "token-mismatch",
        status: res.status,
        latencyMs: healthLatency,
        detail: `token rifiutato (HTTP ${res.status}) — GRAPHHOPPER_TOKEN non combacia con l'X-GH-Token nella nginx del ThinkCentre`,
      };
    }
    if (res.status < 200 || res.status >= 300) {
      return { codice: area.codice, nome: area.nome, verdict: "unreachable", status: res.status, latencyMs: healthLatency, detail: `HTTP ${res.status}` };
    }
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : String(err);
    const detail = err instanceof Error && err.name === "AbortError" ? `timeout (>${Math.round(PROBE_TIMEOUT_MS / 1000)} s)` : raw;
    return { codice: area.codice, nome: area.nome, verdict: "unreachable", status: null, latencyMs: null, detail };
  } finally {
    clearTimeout(timer);
  }

  // /health è 2xx: conferma che l'engine instrada davvero con un /route reale.
  const route = await graphHopperRouteProbe(areaBase, token, areaProbePoints(area));
  if (route.ok) {
    return { codice: area.codice, nome: area.nome, verdict: "ok", status: route.status ?? 200, latencyMs: route.latencyMs, detail: "health + route OK" };
  }
  if (route.status === 401 || route.status === 403 || isAuthError(route.error)) {
    return {
      codice: area.codice,
      nome: area.nome,
      verdict: "token-mismatch",
      status: route.status ?? null,
      latencyMs: route.latencyMs,
      detail: route.error ?? `token rifiutato su /route (HTTP ${route.status ?? "?"})`,
    };
  }
  if (isPointOffNetwork(route.error)) {
    // L'engine ha caricato il grafo e ha davvero eseguito lo snapping: instrada.
    // Il punto di probe (centro bbox) cade solo fuori dalla rete stradale.
    return {
      codice: area.codice,
      nome: area.nome,
      verdict: "ok",
      status: route.status ?? 200,
      latencyMs: route.latencyMs,
      detail: "health OK; engine instrada (punto di probe fuori rete stradale)",
    };
  }
  return {
    codice: area.codice,
    nome: area.nome,
    verdict: "route-broken",
    status: route.status ?? null,
    latencyMs: route.latencyMs,
    detail: `/health OK ma /route KO — ${route.error ?? "errore sconosciuto"}`,
  };
}

async function main(): Promise<void> {
  const base = process.env.GRAPHHOPPER_URL?.replace(/\/$/, "");
  if (!base) {
    console.error("GRAPHHOPPER_URL non configurato — impossibile verificare il token.");
    process.exit(3);
  }

  const token = process.env.GRAPHHOPPER_TOKEN;
  const fp = tokenFingerprint(token);
  const headers: Record<string, string> = { ...cfAccessHeaders() };
  if (token) headers["X-GH-Token"] = token;

  console.log(`GraphHopper token check — base host: ${new URL(base).hostname}`);
  console.log(`GRAPHHOPPER_TOKEN: ${token ? `presente (fingerprint ${fp})` : "ASSENTE"}`);
  console.log("");

  const results = await Promise.all(ROUTING_AREAS.map((a) => probeArea(base, headers, token, a)));

  for (const r of results) {
    const badge =
      r.verdict === "ok"
        ? "OK           "
        : r.verdict === "token-mismatch"
          ? "TOKEN-MISMATCH"
          : r.verdict === "route-broken"
            ? "ROUTE-BROKEN "
            : "UNREACHABLE  ";
    const lat = r.latencyMs != null ? ` ${r.latencyMs}ms` : "";
    console.log(`[${badge}] ${r.codice.padEnd(16)} ${r.detail}${lat}`);
  }

  const mismatch = results.filter((r) => r.verdict === "token-mismatch");
  const routeBroken = results.filter((r) => r.verdict === "route-broken");
  const ok = results.filter((r) => r.verdict === "ok");

  console.log("");
  if (mismatch.length > 0) {
    console.error(`⚠️  Token drift rilevato su ${mismatch.length}/${results.length} aree: il GRAPHHOPPER_TOKEN della app non combacia con quello della nginx sul ThinkCentre.`);
    process.exit(2);
  }
  if (routeBroken.length > 0) {
    console.error(`❌ Routing rotto su ${routeBroken.length}/${results.length} aree: /health risponde ma /route fallisce (grafo mancante, profilo errato o engine KO).`);
    process.exit(4);
  }
  if (ok.length === 0) {
    console.error(`❌ Nessuna area GraphHopper instrada (${results.length} testate).`);
    process.exit(3);
  }
  console.log(`✅ Routing OK: ${ok.length}/${results.length} aree confermano un /route reale col token corrente.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Errore inatteso:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
