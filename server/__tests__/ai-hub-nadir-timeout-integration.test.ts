/**
 * Task #235 — Integration smoke test REALE del timeout /nadir/search.
 *
 * Il timeout da 3 500ms (NADIR_SEARCH_TIMEOUT_MS, Task #172) era verificato
 * solo con fake timers. Qui si conferma con TIMER REALI e un vero server HTTP
 * locale deliberatamente lento che:
 *   - hubPost("/nadir/search", ..., NADIR_SEARCH_TIMEOUT_MS) abortisce davvero
 *     in ~3.5s di wall-clock (non 8s), ritornando { ok:false } senza throw;
 *   - quindi il fallback pgvector di search_manual scatta ben sotto i 4s.
 *
 * Nessun mock di fetch: si usa il fetch nativo di Node contro un http.Server
 * su 127.0.0.1 che non risponde mai entro il timeout. Il test dura ~3.5s di
 * proposito (è il punto: misurare il tempo reale).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";

vi.mock("../lib/cf-access", () => ({
  cfAccessHeaders: () => ({}),
  isCfAccessConfigured: () => false,
}));

/** Server HTTP reale che riceve la richiesta ma non risponde mai (GPU "fredda"). */
function startSlowServer(): Promise<{ server: http.Server; url: string }> {
  return new Promise((resolve) => {
    const server = http.createServer((_req, _res) => {
      // Non rispondere mai: simula l'hub con GPU fredda/appesa.
      // La connessione resta aperta finché il client non abortisce.
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

let activeServer: http.Server | undefined;

afterEach(() => {
  activeServer?.closeAllConnections();
  activeServer?.close();
  activeServer = undefined;
  delete process.env.AI_HUB_URL;
  delete process.env.AI_HUB_GATE_TOKEN;
  vi.resetModules();
});

describe("Task #235 — timeout reale /nadir/search su hub lento", () => {
  it(
    "hubPost con NADIR_SEARCH_TIMEOUT_MS abortisce in ~3.5s reali (non 8s) e ritorna ok:false",
    async () => {
      const { server, url } = await startSlowServer();
      activeServer = server;

      vi.resetModules();
      process.env.AI_HUB_URL = url;
      process.env.AI_HUB_GATE_TOKEN = "test-gate-token";
      const { hubPost, NADIR_SEARCH_TIMEOUT_MS } = await import("../lib/ai-hub-client");

      const started = Date.now();
      const res = await hubPost("/nadir/search", { query: "smoke", limit: 3 }, NADIR_SEARCH_TIMEOUT_MS);
      const elapsed = Date.now() - started;

      // Mai throw: contratto { ok:false, error:"timeout ..." }.
      expect(res.ok).toBe(false);
      expect(res.error).toContain(`timeout ${NADIR_SEARCH_TIMEOUT_MS}ms`);

      // Wall-clock reale: deve scattare al timeout ridotto (3.5s), con un
      // margine di scheduling, e comunque ben sotto gli 8s del timeout default.
      expect(elapsed).toBeGreaterThanOrEqual(NADIR_SEARCH_TIMEOUT_MS - 100);
      expect(elapsed).toBeLessThan(4_500);
    },
    15_000,
  );

  it(
    "senza timeoutMs esplicito il default resta 8s (controprova: a 4s la chiamata è ancora pendente)",
    async () => {
      const { server, url } = await startSlowServer();
      activeServer = server;

      vi.resetModules();
      process.env.AI_HUB_URL = url;
      process.env.AI_HUB_GATE_TOKEN = "test-gate-token";
      const { hubPost } = await import("../lib/ai-hub-client");

      // Non aspettiamo gli 8s pieni: verifichiamo solo che a 4s (dove il
      // timeout ridotto sarebbe già scattato) la chiamata default sia ancora
      // in volo — cioè che il 3.5s sia davvero un override e non il default.
      let settled = false;
      const pending = hubPost("/nadir/search", { query: "smoke" }).then((r) => {
        settled = true;
        return r;
      });
      await new Promise((r) => setTimeout(r, 4_000));
      expect(settled).toBe(false);

      // Cleanup deterministico: chiudi le connessioni per far fallire subito.
      server.closeAllConnections();
      const res = await pending;
      expect(res.ok).toBe(false);
    },
    15_000,
  );
});
