import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import http from "node:http";
import express from "express";

// Task #21 — Porting da BikerBlog (contratto di parità AI, punto E1).
//
// L'abort dello stream AI su disconnessione del client DEVE essere agganciato a
// `res.on("close")`, MAI a `req.on("close")`. Su Node 20 + express.json():
//   - `req` (IncomingMessage) emette "close" appena il body della POST è stato
//     consumato dal middleware, cioè PRIMA che l'handler di streaming inizi.
//   - "close" è un evento one-shot: un listener agganciato dopo che è già
//     scattato non viene mai chiamato.
// Conseguenza del bug: `req.on("close", abort)` agganciato dopo gli await
// dell'handler o non scatta mai (abort morto → il server continua a generare e
// scrivere su un socket già chiuso, sprecando compute/quota) oppure, se lo
// intercetta, aborta il turno prima ancora del primo token.
// Il fix (`res.on("close")`) scatta solo alla reale chiusura della risposta.

// ---------------------------------------------------------------------------
// #1 — Invariante di semantica Node (perché il fix è corretto)
// ---------------------------------------------------------------------------

describe("Task #21 (E1) — semantica close: res vs req", () => {
  it("res.on('close') NON scatta al parse del body (req.on('close') sì) e scatta alla disconnessione", async () => {
    const app = express();
    app.use(express.json());

    // Cattura di ciò che è successo nei due scenari, ispezionata dal test.
    const normal = { reqEarly: false, resEarly: false };
    const disconnect = { reqAbortFired: false, resAbortFired: false };

    app.post("/normal", (req, res) => {
      let firstWrite = false;
      req.on("close", () => { if (!firstWrite) normal.reqEarly = true; });
      res.on("close", () => { if (!firstWrite) normal.resEarly = true; });
      res.setHeader("Content-Type", "text/event-stream");
      res.flushHeaders();
      setTimeout(() => {
        firstWrite = true;
        res.write("data: hi\n\n");
        res.end();
      }, 80);
    });

    app.post("/disconnect", (req, res) => {
      // Riproduce il timing reale della route: i listener si agganciano DOPO un
      // tick (come dopo gli await di config/persona/contesto nell'handler vero).
      setImmediate(() => {
        req.on("close", () => { disconnect.reqAbortFired = true; });
        res.on("close", () => { disconnect.resAbortFired = true; });
      });
      res.setHeader("Content-Type", "text/event-stream");
      res.flushHeaders();
      res.write("data: start\n\n");
      // Non chiude mai da solo: aspettiamo che il client si disconnetta.
      setTimeout(() => { try { res.end(); } catch { /* */ } }, 300);
    });

    const server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as { port: number }).port;
    const body = JSON.stringify({ message: "x" });
    const baseHeaders = {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    };

    try {
      // Scenario normale: completamento pulito.
      await new Promise<void>((resolveDone) => {
        const r = http.request(
          { port, path: "/normal", method: "POST", headers: baseHeaders },
          (resp) => { resp.resume(); resp.on("end", () => resolveDone()); },
        );
        r.write(body);
        r.end();
      });

      // Scenario disconnessione: il client stacca dopo il primo chunk.
      await new Promise<void>((resolveDone) => {
        const r = http.request(
          { port, path: "/disconnect", method: "POST", headers: baseHeaders },
          (resp) => {
            resp.on("data", () => { setTimeout(() => r.destroy(), 40); });
          },
        );
        r.on("error", () => { /* atteso: connessione distrutta */ });
        r.write(body);
        r.end();
        setTimeout(() => resolveDone(), 250);
      });
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }

    // Completamento normale: res NON scatta in anticipo (req invece sì → sarebbe
    // un abort prematuro se ci fossimo appoggiati a req).
    expect(normal.resEarly).toBe(false);
    expect(normal.reqEarly).toBe(true);

    // Disconnessione reale: solo res.on("close") rileva lo stacco del client;
    // req.on("close") agganciato dopo il tick ha perso l'evento one-shot.
    expect(disconnect.resAbortFired).toBe(true);
    expect(disconnect.reqAbortFired).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// #2 — Guardia sulle route reali (anti-regressione sul file)
// ---------------------------------------------------------------------------

describe("Task #21 (E1) — le route AI in streaming usano res.on('close') per l'abort", () => {
  const routes = [
    "server/routes/ai-assistant.ts",
    "server/routes/admin/ai-console.ts",
  ];

  for (const rel of routes) {
    it(`${rel}: abort agganciato a res.on("close"), mai a req.on("close")`, () => {
      const src = readFileSync(resolve(process.cwd(), rel), "utf8");
      // Deve esistere l'aggancio corretto sull'abort controller.
      expect(src).toMatch(/res\.on\(\s*["']close["']\s*,\s*\(\)\s*=>\s*abort\.abort\(\)\s*\)/);
      // Non deve esistere l'aggancio buggato dell'abort su req.
      expect(src).not.toMatch(/req\.on\(\s*["']close["']\s*,\s*\(\)\s*=>\s*abort\.abort\(\)\s*\)/);
    });
  }
});
