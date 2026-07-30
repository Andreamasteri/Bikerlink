import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  deleteObject,
  getPublicUrl,
  objectExists,
  uploadBuffer,
} from "../objectStorage";

const ENV_KEYS = [
  "R2_ENDPOINT",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_PUBLIC_BUCKET",
  "R2_PRIVATE_BUCKET",
  "R2_PUBLIC_BASE_URL",
] as const;

describe("Cloudflare R2 object storage", () => {
  beforeEach(() => {
    process.env.R2_ENDPOINT =
      "https://account-id.eu.r2.cloudflarestorage.com";
    process.env.R2_ACCESS_KEY_ID = ["unit", "test", "id"].join("-");
    process.env.R2_SECRET_ACCESS_KEY = ["unit", "test", "credential"].join("-");
    process.env.R2_PUBLIC_BUCKET = "bikerlink-public";
    process.env.R2_PRIVATE_BUCKET = "bikerlink-private";
    process.env.R2_PUBLIC_BASE_URL = "https://media.biker-link.net";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it("routes public and private objects to different buckets", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await uploadBuffer("ProfilePic/user.webp", Buffer.from("public"), "image/webp");
    await uploadBuffer("private/ota/release.js", Buffer.from("private"), "text/javascript");

    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "/bikerlink-public/ProfilePic/user.webp"
    );
    expect(String(fetchMock.mock.calls[1][0])).toContain(
      "/bikerlink-private/private/ota/release.js"
    );
  });

  it("signs requests without exposing the secret", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await deleteObject("Campaign/ads/test.png");

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toContain("AWS4-HMAC-SHA256");
    expect(headers.Authorization).toContain(["unit", "test", "id"].join("-"));
    expect(JSON.stringify(init)).not.toContain(
      ["unit", "test", "credential"].join("-")
    );
  });

  it("treats an R2 404 HEAD response as a missing object", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 404 }))
    );
    await expect(objectExists("PhotoContest/missing.webp")).resolves.toBe(false);
  });

  it("builds encoded URLs only for public objects", async () => {
    await expect(getPublicUrl("public/docs/manuale biker.pdf")).resolves.toBe(
      "https://media.biker-link.net/public/docs/manuale%20biker.pdf"
    );
    await expect(getPublicUrl(".private/backups/db.zip")).rejects.toThrow(
      "non può avere un URL pubblico"
    );
  });

  it("rejects traversal before sending a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      uploadBuffer("../secret", Buffer.from("x"), "text/plain")
    ).rejects.toThrow("Percorso object storage non valido");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
