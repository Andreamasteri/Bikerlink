import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerMatchingPdfRoutes } from "../routes/matching-pdf";

const originalCwd = process.cwd();
let tempRoot: string;

function buildApp() {
  const app = express();
  registerMatchingPdfRoutes(app);
  return app;
}

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bikerlink-matching-pdf-"));
  fs.mkdirSync(path.join(tempRoot, "server/public/assets"), { recursive: true });
  process.chdir(tempRoot);
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("matching-system PDF routes", () => {
  it.each([
    "/matching-system.pdf",
    "/api/exports/matching-system.pdf",
  ])("returns 404 when the canonical matching PDF is absent: %s", async (route) => {
    const response = await request(buildApp()).get(route);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: "PDF non disponibile" });
  });

  it("serves the same canonical matching PDF from both aliases", async () => {
    const matchingPdf = Buffer.from("%PDF-1.4\nMATCHING-SYSTEM");
    const competitorPdf = Buffer.from("%PDF-1.4\nCOMPETITOR-ANALYSIS");
    fs.writeFileSync(path.join(tempRoot, "server/public/matching-system.pdf"), matchingPdf);
    fs.writeFileSync(
      path.join(tempRoot, "server/public/assets/competitor-analysis.pdf"),
      competitorPdf,
    );

    for (const route of ["/matching-system.pdf", "/api/exports/matching-system.pdf"]) {
      const response = await request(buildApp())
        .get(route)
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => callback(null, Buffer.concat(chunks)));
        });

      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toMatch(/^application\/pdf/);
      expect(response.headers["content-disposition"]).toBe(
        'inline; filename="BikerLink-MatchingSystem.pdf"',
      );
      expect(response.body).toEqual(matchingPdf);
      expect(response.body).not.toEqual(competitorPdf);
    }
  });
});
