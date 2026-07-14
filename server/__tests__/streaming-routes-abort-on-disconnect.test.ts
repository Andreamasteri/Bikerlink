import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import http from "node:http";
import express from "express";

// Task #43 — Le stesse route non-AI toccate dal bug documentato in
// .agents/memory/sse-abort-res-not-req.md (Task #21 / BikerBlog E1):
// `req.on("close")` è morto su Node 20 + express.json() perché la
// IncomingMessage emette "close" (one-shot) non appena il body/stream della
// richiesta viene consumato dal middleware globale, ben prima che l'handler
// arrivi ad agganciare il listener. Solo `res.on("close")` rileva in modo
// affidabile la disconnessione reale del client.
//
// Qui verifichiamo staticamente che ognuna delle route indicate dal task usi
// `res.on("close")` per il segnale di abort/cleanup e non `req.on("close")`
// (o `req.on("aborted")`), e proviamo a runtime che anche una GET SSE dietro
// il middleware globale `express.json()` soffre dello stesso bug se si
// ascolta su `req`.

describe("Task #43 — anche le route GET soffrono del bug req.on('close') dietro express.json() globale", () => {
  it("req.on('close') scatta in anticipo anche su una GET senza body (middleware globale applicato a tutte le richieste)", async () => {
    const app = express();
    app.use(express.json());

    const disconnect = { reqAbortFired: false, resAbortFired: false };

    app.get("/get-stream", (req, res) => {
      setImmediate(() => {
        req.on("close", () => { disconnect.reqAbortFired = true; });
        res.on("close", () => { disconnect.resAbortFired = true; });
      });
      res.setHeader("Content-Type", "text/event-stream");
      res.flushHeaders();
      res.write("data: start\n\n");
      setTimeout(() => { try { res.end(); } catch { /* noop */ } }, 300);
    });

    const server = http.createServer(app);
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as { port: number }).port;

    try {
      await new Promise<void>((resolveDone) => {
        const r = http.request({ port, path: "/get-stream", method: "GET" }, (resp) => {
          resp.on("data", () => { setTimeout(() => r.destroy(), 40); });
        });
        r.on("error", () => { /* atteso: connessione distrutta */ });
        r.end();
        setTimeout(() => resolveDone(), 250);
      });
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }

    // req "close" è già scattato (durante l'elaborazione del middleware
    // globale/della richiesta stessa) prima che il setImmediate agganciasse
    // il listener sull'evento one-shot → il listener su req non l'ha mai
    // ricevuto, quindi non riflette la disconnessione reale.
    expect(disconnect.reqAbortFired).toBe(true);
    // res "close" invece rileva correttamente e in modo affidabile la
    // disconnessione reale del client.
    expect(disconnect.resAbortFired).toBe(true);
  });
});

describe("Task #43 — le route streaming/long-lived usano res.on('close') per l'abort/cleanup", () => {
  const routes = [
    "server/routes/chat/stream.ts",
    "server/routes/auth/login.ts",
    "server/routes/radio/playback.ts",
    "server/routes/planned-routes/waypoints.ts",
    "server/routes/admin/diagnostics-stream.ts",
    "server/routes/admin/translations.ts",
  ];

  // Le righe di codice sono confrontate escludendo i commenti (che citano
  // volutamente `req.on("close")` per spiegare il bug storico).
  const codeLines = (src: string) =>
    src.split("\n").filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"));

  for (const rel of routes) {
    it(`${rel}: nessun req.on("close"/"aborted") usato per abort/cleanup, presente res.on("close")`, () => {
      const src = codeLines(readFileSync(resolve(process.cwd(), rel), "utf8")).join("\n");
      expect(src).toMatch(/res\.on\(\s*["']close["']/);
      expect(src).not.toMatch(/req\.on\(\s*["']close["']/);
      expect(src).not.toMatch(/req\.on\(\s*["']aborted["']/);
    });
  }

  it("planned-routes/waypoints.ts: entrambe le route AI (/ai-parse, /ai-stream) agganciano l'abort su res, non su req", () => {
    const src = codeLines(readFileSync(resolve(process.cwd(), "server/routes/planned-routes/waypoints.ts"), "utf8")).join("\n");
    const resOnCloseCount = (src.match(/res\.on\(\s*["']close["']\s*,\s*onClose\s*\)/g) ?? []).length;
    const resOffCloseCount = (src.match(/res\.off\(\s*["']close["']\s*,\s*onClose\s*\)/g) ?? []).length;
    expect(resOnCloseCount).toBe(2);
    // off() è chiamato su ogni percorso di uscita (successo/errore) di entrambe le route.
    expect(resOffCloseCount).toBe(4);
    expect(src).not.toMatch(/req\.on\(\s*["']close["']\s*,\s*onClose\s*\)/);
    expect(src).not.toMatch(/req\.off\(\s*["']close["']\s*,\s*onClose\s*\)/);
  });
});
