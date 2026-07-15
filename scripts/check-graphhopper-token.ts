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
 * Per ogni area di routing lo script interroga l'endpoint `/health` e classifica:
 *   - ok            → 2xx, il token combacia e il servizio risponde
 *   - token-mismatch→ 401/403, servizio raggiungibile ma token rifiutato (DRIFT)
 *   - unreachable   → timeout / errore di rete / 5xx / altro
 *
 * NON stampa mai il valore del token: solo un fingerprint SHA-256 a 8 caratteri.
 *
 * Uso:  npx tsx scripts/check-graphhopper-token.ts
 * Exit: 0 se tutte le aree raggiungibili sono ok; 2 se rilevato token-mismatch;
 *       3 se nessuna area è raggiungibile.
 */

import { cfAccessHeaders } from "../server/lib/cf-access";
import { tokenFingerprint } from "../server/routes/admin/thinkcentre-health-utils";
import { ROUTING_AREAS } from "../shared/routing-areas";

const PROBE_TIMEOUT_MS = 15_000;

type Verdict = "ok" | "token-mismatch" | "unreachable";

interface AreaResult {
  codice: string;
  nome: string;
  verdict: Verdict;
  status: number | null;
  latencyMs: number | null;
  detail: string;
}

async function probeArea(base: string, headers: Record<string, string>, area: (typeof ROUTING_AREAS)[number]): Promise<AreaResult> {
  const url = `${base}${area.path}/health`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const res = await fetch(url, { method: "GET", headers, signal: controller.signal });
    const latencyMs = Date.now() - t0;
    if (res.status >= 200 && res.status < 300) {
      return { codice: area.codice, nome: area.nome, verdict: "ok", status: res.status, latencyMs, detail: "health OK" };
    }
    if (res.status === 401 || res.status === 403) {
      return {
        codice: area.codice,
        nome: area.nome,
        verdict: "token-mismatch",
        status: res.status,
        latencyMs,
        detail: `token rifiutato (HTTP ${res.status}) — GRAPHHOPPER_TOKEN non combacia con l'X-GH-Token nella nginx del ThinkCentre`,
      };
    }
    return { codice: area.codice, nome: area.nome, verdict: "unreachable", status: res.status, latencyMs, detail: `HTTP ${res.status}` };
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : String(err);
    const detail = err instanceof Error && err.name === "AbortError" ? `timeout (>${Math.round(PROBE_TIMEOUT_MS / 1000)} s)` : raw;
    return { codice: area.codice, nome: area.nome, verdict: "unreachable", status: null, latencyMs: null, detail };
  } finally {
    clearTimeout(timer);
  }
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

  const results = await Promise.all(ROUTING_AREAS.map((a) => probeArea(base, headers, a)));

  for (const r of results) {
    const badge = r.verdict === "ok" ? "OK           " : r.verdict === "token-mismatch" ? "TOKEN-MISMATCH" : "UNREACHABLE  ";
    const lat = r.latencyMs != null ? ` ${r.latencyMs}ms` : "";
    console.log(`[${badge}] ${r.codice.padEnd(16)} ${r.detail}${lat}`);
  }

  const mismatch = results.filter((r) => r.verdict === "token-mismatch");
  const ok = results.filter((r) => r.verdict === "ok");

  console.log("");
  if (mismatch.length > 0) {
    console.error(`⚠️  Token drift rilevato su ${mismatch.length}/${results.length} aree: il GRAPHHOPPER_TOKEN della app non combacia con quello della nginx sul ThinkCentre.`);
    process.exit(2);
  }
  if (ok.length === 0) {
    console.error(`❌ Nessuna area GraphHopper raggiungibile (${results.length} testate).`);
    process.exit(3);
  }
  console.log(`✅ Token OK: ${ok.length}/${results.length} aree rispondono con il token corrente.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Errore inatteso:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
