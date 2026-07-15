/**
 * Task #161 — Live smoke test: POST /ai-hub/nadir/search < 3s
 *
 * Verifica che il TC ai-hub risponda con frammenti semantici del manuale
 * Nadir entro 3 secondi una volta che la GPU è operativa.
 *
 * Richiede i secret:
 *   AI_HUB_URL         — es. https://tc.biker-link.net/ai-hub
 *   AI_HUB_GATE_TOKEN  — gate token uguale a HUB_GATE_TOKEN nel .env dell'hub
 *   CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET (Cloudflare Access)
 *
 * Usage:
 *   npx tsx scripts/smoke-ai-hub-search.ts
 *
 * Exit code 0 → pass; exit code 1 → fail.
 */

const AI_HUB_URL = (process.env.AI_HUB_URL ?? "").trim().replace(/\/+$/, "");
const AI_HUB_GATE_TOKEN = (process.env.AI_HUB_GATE_TOKEN ?? "").trim();
const CF_CLIENT_ID = (process.env.CF_ACCESS_CLIENT_ID ?? "").trim();
const CF_CLIENT_SECRET = (process.env.CF_ACCESS_CLIENT_SECRET ?? "").trim();

const QUERY = "come pianificare un percorso moto in montagna";
const LIMIT = 3;
const SLA_MS = 3000;
const TIMEOUT_MS = 10_000;

// ── Prerequisiti ──────────────────────────────────────────────────────────────
if (!AI_HUB_URL || !AI_HUB_GATE_TOKEN) {
  console.error(
    "❌  Secret AI_HUB_URL e/o AI_HUB_GATE_TOKEN non impostati.\n" +
    "    Imposta i secret Replit prima di eseguire questo smoke test.",
  );
  process.exit(1);
}

// ── Probe ─────────────────────────────────────────────────────────────────────
async function probe(): Promise<void> {
  const url = `${AI_HUB_URL}/nadir/search`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Hub-Gate-Token": AI_HUB_GATE_TOKEN,
  };
  if (CF_CLIENT_ID) headers["CF-Access-Client-Id"] = CF_CLIENT_ID;
  if (CF_CLIENT_SECRET) headers["CF-Access-Client-Secret"] = CF_CLIENT_SECRET;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  console.log(`\n🔍  POST ${url}`);
  console.log(`    query  : "${QUERY}"`);
  console.log(`    limit  : ${LIMIT}`);
  console.log(`    SLA    : < ${SLA_MS}ms\n`);

  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      signal: ctrl.signal,
      body: JSON.stringify({ query: QUERY, limit: LIMIT, language: "it" }),
    });
  } catch (err) {
    clearTimeout(timer);
    const msg = (err as Error)?.name === "AbortError"
      ? `timeout dopo ${TIMEOUT_MS}ms`
      : (err as Error)?.message ?? String(err);
    console.error(`❌  Errore di rete: ${msg}`);
    process.exit(1);
  }
  const elapsed = Date.now() - t0;
  clearTimeout(timer);

  // ── Risposta HTTP ─────────────────────────────────────────────────────────
  const text = await res.text();
  let body: unknown;
  try { body = JSON.parse(text); } catch { body = text; }

  if (!res.ok) {
    console.error(`❌  HTTP ${res.status}: ${text.slice(0, 300)}`);
    process.exit(1);
  }

  const data = body as {
    ok?: boolean;
    model?: string;
    fragments?: Array<{ origin?: string; similarity?: number; text?: string }>;
  };

  // ── Validazione struttura ─────────────────────────────────────────────────
  if (!data.ok || !Array.isArray(data.fragments)) {
    console.error(`❌  Risposta malformata: ${JSON.stringify(data).slice(0, 300)}`);
    process.exit(1);
  }

  // ── Risultati ─────────────────────────────────────────────────────────────
  console.log(`✅  HTTP ${res.status} — ${elapsed}ms — model: ${data.model ?? "(n/d)"}`);
  console.log(`    frammenti ricevuti: ${data.fragments.length}`);
  data.fragments.forEach((f, i) => {
    const sim = f.similarity !== undefined ? ` [sim=${f.similarity.toFixed(4)}]` : "";
    const origin = f.origin ? ` (${f.origin})` : "";
    const preview = (f.text ?? "").slice(0, 80).replace(/\n/g, " ");
    console.log(`    [${i + 1}]${sim}${origin} ${preview}`);
  });

  // ── SLA check ─────────────────────────────────────────────────────────────
  if (elapsed > SLA_MS) {
    console.error(
      `\n❌  FAIL latenza: ${elapsed}ms supera il limite SLA di ${SLA_MS}ms.\n` +
      "    La GPU potrebbe essere ancora in fase di warm-up o sovraccarica.\n" +
      "    Verifica con: python3 .agents/skills/thinkcentre-access/tc.py exec \"nvidia-smi --query-gpu=utilization.gpu,memory.used --format=csv,noheader\"",
    );
    process.exit(1);
  }

  console.log(`\n🎉  PASS — risposta in ${elapsed}ms (SLA ${SLA_MS}ms rispettato)`);
}

probe().catch((err) => {
  console.error("❌  Errore inatteso:", err);
  process.exit(1);
});
