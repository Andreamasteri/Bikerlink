import { describe, it, expect, beforeAll } from "vitest";
import { sanitizeError } from "../routes/admin/ai/test-ollama";

const URL_WITH_PATH = "https://bikerlink.tail5056aa.ts.net/ollama/api/chat";
const TOKEN = "super-secret-token-abc123";

beforeAll(() => {
  process.env.BOWIE_OLLAMA_URL = URL_WITH_PATH;
  process.env.BOWIE_OLLAMA_TOKEN = TOKEN;
});

describe("sanitizeError (admin/ai/test-ollama)", () => {
  it("non espone mai il path/credenziali dell'URL Ollama", () => {
    const raw = `fetch failed for ${URL_WITH_PATH}: ECONNREFUSED`;
    const out = sanitizeError(raw);
    expect(out).not.toContain("/ollama/api/chat");
    expect(out).not.toContain(URL_WITH_PATH);
    expect(out).toContain("https://bikerlink.tail5056aa.ts.net");
  });

  it("non espone mai il token Ollama", () => {
    const raw = `auth failed with X-Ollama-Token: ${TOKEN}`;
    const out = sanitizeError(raw);
    expect(out).not.toContain(TOKEN);
    expect(out).toContain("***");
  });

  it("maschera header di autorizzazione generici", () => {
    const raw = "request rejected: authorization=Bearer eyJhbGciOiJ";
    const out = sanitizeError(raw);
    expect(out).not.toContain("eyJhbGciOiJ");
  });

  it("tronca a 300 caratteri", () => {
    const out = sanitizeError("x".repeat(500));
    expect(out.length).toBeLessThanOrEqual(300);
  });
});
