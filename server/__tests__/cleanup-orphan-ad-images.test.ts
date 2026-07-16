/**
 * Tests: cleanupOrphanAdImages()
 *
 * Logica coperta:
 *  - Orfani eliminati — file non referenziati vengono cancellati.
 *  - File referenziati preservati — file citati da una campagna non vengono toccati.
 *  - Safety guard — con 0 riferimenti ma orfani presenti la sweep viene saltata.
 *  - Dry-run — nessuna eliminazione effettiva, ma conteggio corretto.
 *  - Conteggio errori — errori durante deleteObject incrementano errors.
 *  - Bucket vuoto — ritorna subito con tutti i contatori a 0.
 *  - Sub-prefix ignorati — entry con "/" dopo il prefix non vengono trattate come orfani.
 *  - Path traversal — filename con ".." o "/" nell'imageUrl non entrano nel set di riferimenti.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockListObjects, mockDeleteObject, mockGetAllCampaigns } = vi.hoisted(() => ({
  mockListObjects: vi.fn(),
  mockDeleteObject: vi.fn(),
  mockGetAllCampaigns: vi.fn(),
}));

vi.mock("../objectStorage", () => ({
  listObjects: mockListObjects,
  deleteObject: mockDeleteObject,
  BUCKET_CAMPAIGN: "Campaign/ads/",
}));

vi.mock("../storage", () => ({
  storage: {
    getAllCampaigns: mockGetAllCampaigns,
  },
}));

// ── Import module under test ─────────────────────────────────────────────────

import { cleanupOrphanAdImages } from "../ads/cleanup-orphan-images";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeFile(filename: string, size = 1024): { name: string; size: number; createdTime: string } {
  return { name: `public/ads/${filename}`, size, createdTime: "2025-01-01T00:00:00Z" };
}

function makeCampaign(filename: string | null): { id: number; imageUrl: string | null } {
  return {
    id: Math.floor(Math.random() * 10000),
    imageUrl: filename ? `/api/ads/images/${filename}` : null,
  };
}

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockDeleteObject.mockResolvedValue(undefined);
  // cleanupOrphanAdImages now calls listObjects twice: first for Campaign/ads/, then for
  // public/ads/. Default the first call (Campaign/ads/) to [] so existing tests that set
  // mockResolvedValue still work — their data is returned on the second (public/ads/) call.
  mockListObjects.mockReturnValueOnce(Promise.resolve([]));
});

// ─────────────────────────────────────────────────────────────────────────────
// Bucket vuoto
// ─────────────────────────────────────────────────────────────────────────────

describe("cleanupOrphanAdImages — bucket vuoto", () => {
  it("ritorna subito con tutti i contatori a 0 senza chiamare getAllCampaigns", async () => {
    mockListObjects.mockResolvedValue([]);

    const result = await cleanupOrphanAdImages();

    expect(result.scanned).toBe(0);
    expect(result.referenced).toBe(0);
    expect(result.orphans).toBe(0);
    expect(result.deleted).toBe(0);
    expect(result.errors).toBe(0);
    expect(result.skipped).toBe(false);
    expect(mockGetAllCampaigns).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Orfani eliminati
// ─────────────────────────────────────────────────────────────────────────────

describe("cleanupOrphanAdImages — orfani eliminati", () => {
  it("elimina i file non referenziati da nessuna campagna (con almeno un riferimento per bypassare il guard)", async () => {
    mockListObjects.mockResolvedValue([makeFile("orphan1.jpg"), makeFile("orphan2.png"), makeFile("ref.jpg")]);
    mockGetAllCampaigns.mockResolvedValue([makeCampaign("ref.jpg")]);

    const result = await cleanupOrphanAdImages();

    expect(result.scanned).toBe(3);
    expect(result.orphans).toBe(2);
    expect(result.deleted).toBe(2);
    expect(result.errors).toBe(0);
    expect(result.skipped).toBe(false);
    expect(mockDeleteObject).toHaveBeenCalledTimes(2);
    expect(mockDeleteObject).toHaveBeenCalledWith("public/ads/orphan1.jpg");
    expect(mockDeleteObject).toHaveBeenCalledWith("public/ads/orphan2.png");
    expect(mockDeleteObject).not.toHaveBeenCalledWith("public/ads/ref.jpg");
  });

  it("elimina solo gli orfani quando ci sono anche file referenziati", async () => {
    mockListObjects.mockResolvedValue([
      makeFile("keep.jpg"),
      makeFile("orphan.png"),
    ]);
    mockGetAllCampaigns.mockResolvedValue([makeCampaign("keep.jpg")]);

    const result = await cleanupOrphanAdImages();

    expect(result.scanned).toBe(2);
    expect(result.referenced).toBe(1);
    expect(result.orphans).toBe(1);
    expect(result.deleted).toBe(1);
    expect(mockDeleteObject).toHaveBeenCalledTimes(1);
    expect(mockDeleteObject).toHaveBeenCalledWith("public/ads/orphan.png");
    expect(mockDeleteObject).not.toHaveBeenCalledWith("public/ads/keep.jpg");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// File referenziati preservati
// ─────────────────────────────────────────────────────────────────────────────

describe("cleanupOrphanAdImages — file referenziati preservati", () => {
  it("non elimina file citati da una campagna", async () => {
    mockListObjects.mockResolvedValue([makeFile("banner.jpg")]);
    mockGetAllCampaigns.mockResolvedValue([makeCampaign("banner.jpg")]);

    const result = await cleanupOrphanAdImages();

    expect(result.deleted).toBe(0);
    expect(result.orphans).toBe(0);
    expect(mockDeleteObject).not.toHaveBeenCalled();
  });

  it("un file referenziato da più campagne non viene eliminato", async () => {
    mockListObjects.mockResolvedValue([makeFile("shared.jpg")]);
    mockGetAllCampaigns.mockResolvedValue([
      makeCampaign("shared.jpg"),
      makeCampaign("shared.jpg"),
    ]);

    const result = await cleanupOrphanAdImages();

    expect(result.referenced).toBe(1);
    expect(result.deleted).toBe(0);
    expect(mockDeleteObject).not.toHaveBeenCalled();
  });

  it("campagna senza imageUrl non contribuisce ai riferimenti", async () => {
    mockListObjects.mockResolvedValue([makeFile("ref.jpg"), makeFile("orphan.jpg")]);
    mockGetAllCampaigns.mockResolvedValue([makeCampaign("ref.jpg"), makeCampaign(null)]);

    const result = await cleanupOrphanAdImages();

    expect(result.referenced).toBe(1);
    expect(result.orphans).toBe(1);
    expect(result.deleted).toBe(1);
    expect(mockDeleteObject).toHaveBeenCalledWith("public/ads/orphan.jpg");
    expect(mockDeleteObject).not.toHaveBeenCalledWith("public/ads/ref.jpg");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Safety guard
// ─────────────────────────────────────────────────────────────────────────────

describe("cleanupOrphanAdImages — safety guard", () => {
  it("salta la sweep quando ci sono 0 riferimenti ma orfani presenti", async () => {
    mockListObjects.mockResolvedValue([makeFile("file1.jpg"), makeFile("file2.png")]);
    mockGetAllCampaigns.mockResolvedValue([]);

    const result = await cleanupOrphanAdImages();

    expect(result.skipped).toBe(true);
    expect(result.deleted).toBe(0);
    expect(result.orphans).toBe(2);
    expect(result.reason).toMatch(/blip/i);
    expect(mockDeleteObject).not.toHaveBeenCalled();
  });

  it("include il conteggio degli orfani nel messaggio reason", async () => {
    mockListObjects.mockResolvedValue([makeFile("a.jpg"), makeFile("b.jpg"), makeFile("c.jpg")]);
    mockGetAllCampaigns.mockResolvedValue([]);

    const result = await cleanupOrphanAdImages();

    expect(result.skipped).toBe(true);
    expect(result.reason).toContain("3");
  });

  it("NON salta quando ci sono riferimenti ma anche orfani (scenario normale)", async () => {
    mockListObjects.mockResolvedValue([makeFile("ref.jpg"), makeFile("orphan.jpg")]);
    mockGetAllCampaigns.mockResolvedValue([makeCampaign("ref.jpg")]);

    const result = await cleanupOrphanAdImages();

    expect(result.skipped).toBe(false);
    expect(result.deleted).toBe(1);
  });

  it("NON salta quando non ci sono né riferimenti né orfani (bucket con sub-prefix only)", async () => {
    mockListObjects.mockResolvedValue([
      { name: "public/ads/subdir/nested.jpg", size: 100, createdTime: "2025-01-01T00:00:00Z" },
    ]);
    mockGetAllCampaigns.mockResolvedValue([]);

    const result = await cleanupOrphanAdImages();

    expect(result.skipped).toBe(false);
    expect(result.orphans).toBe(0);
    expect(result.deleted).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Dry-run
// ─────────────────────────────────────────────────────────────────────────────

describe("cleanupOrphanAdImages — dry-run", () => {
  it("non elimina nulla in dry-run ma conteggia correttamente gli orfani", async () => {
    mockListObjects.mockResolvedValue([makeFile("orphan1.jpg"), makeFile("orphan2.png")]);
    mockGetAllCampaigns.mockResolvedValue([makeCampaign("orphan1.jpg")]);

    const result = await cleanupOrphanAdImages({ dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.orphans).toBe(1);
    expect(result.deleted).toBe(0);
    expect(result.errors).toBe(0);
    expect(mockDeleteObject).not.toHaveBeenCalled();
  });

  it("dry-run con 0 campagne e orfani triggera il safety guard (skipped=true, deleted=0)", async () => {
    mockListObjects.mockResolvedValue([makeFile("a.jpg")]);
    mockGetAllCampaigns.mockResolvedValue([]);

    const result = await cleanupOrphanAdImages({ dryRun: true });

    expect(result.skipped).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.deleted).toBe(0);
    expect(mockDeleteObject).not.toHaveBeenCalled();
  });

  it("dry-run restituisce dryRun=true nel result", async () => {
    mockListObjects.mockResolvedValue([makeFile("x.jpg")]);
    mockGetAllCampaigns.mockResolvedValue([makeCampaign("x.jpg")]);

    const result = await cleanupOrphanAdImages({ dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.deleted).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Conteggio errori
// ─────────────────────────────────────────────────────────────────────────────

describe("cleanupOrphanAdImages — conteggio errori", () => {
  it("incrementa errors quando deleteObject lancia un'eccezione", async () => {
    mockListObjects.mockResolvedValue([makeFile("fail.jpg"), makeFile("ok.jpg")]);
    mockGetAllCampaigns.mockResolvedValue([makeCampaign("ref.jpg")]);

    mockDeleteObject
      .mockRejectedValueOnce(new Error("storage error"))
      .mockResolvedValueOnce(undefined);

    const result = await cleanupOrphanAdImages();

    expect(result.errors).toBe(1);
    expect(result.deleted).toBe(1);
    expect(result.orphans).toBe(2);
  });

  it("continua ad eliminare altri file dopo un errore su uno specifico file", async () => {
    mockListObjects.mockResolvedValue([
      makeFile("err1.jpg"),
      makeFile("err2.jpg"),
      makeFile("ok.jpg"),
      makeFile("ref.jpg"),
    ]);
    mockGetAllCampaigns.mockResolvedValue([makeCampaign("ref.jpg")]);

    mockDeleteObject
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockResolvedValueOnce(undefined);

    const result = await cleanupOrphanAdImages();

    expect(result.errors).toBe(2);
    expect(result.deleted).toBe(1);
    expect(result.orphans).toBe(3);
    expect(result.skipped).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Estrazione filename dall'imageUrl
// ─────────────────────────────────────────────────────────────────────────────

describe("cleanupOrphanAdImages — estrazione filename dall'imageUrl", () => {
  it("riconosce il formato /api/ads/images/<filename>", async () => {
    mockListObjects.mockResolvedValue([makeFile("ad-banner.jpg")]);
    mockGetAllCampaigns.mockResolvedValue([
      { id: 1, imageUrl: "/api/ads/images/ad-banner.jpg" },
    ]);

    const result = await cleanupOrphanAdImages();

    expect(result.referenced).toBe(1);
    expect(result.deleted).toBe(0);
  });

  it("ignora imageUrl con path traversal (..)", async () => {
    mockListObjects.mockResolvedValue([makeFile("target.jpg")]);
    mockGetAllCampaigns.mockResolvedValue([
      { id: 1, imageUrl: "/api/ads/images/../target.jpg" },
    ]);

    const result = await cleanupOrphanAdImages();

    expect(result.referenced).toBe(0);
    expect(result.orphans).toBe(1);
  });

  it("ignora imageUrl con slash nel filename (sub-path)", async () => {
    mockListObjects.mockResolvedValue([makeFile("target.jpg")]);
    mockGetAllCampaigns.mockResolvedValue([
      { id: 1, imageUrl: "/api/ads/images/sub/target.jpg" },
    ]);

    const result = await cleanupOrphanAdImages();

    expect(result.referenced).toBe(0);
    expect(result.orphans).toBe(1);
  });

  it("ignora imageUrl con formato non riconosciuto", async () => {
    mockListObjects.mockResolvedValue([makeFile("photo.jpg")]);
    mockGetAllCampaigns.mockResolvedValue([
      { id: 1, imageUrl: "https://cdn.example.com/photo.jpg" },
    ]);

    const result = await cleanupOrphanAdImages();

    expect(result.referenced).toBe(0);
    expect(result.orphans).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Sub-prefix ignorati
// ─────────────────────────────────────────────────────────────────────────────

describe("cleanupOrphanAdImages — sub-prefix ignorati", () => {
  it("non tratta come orfani i file con '/' nel filename dopo il prefix", async () => {
    mockListObjects.mockResolvedValue([
      { name: "public/ads/subfolder/file.jpg", size: 100, createdTime: "2025-01-01T00:00:00Z" },
    ]);
    mockGetAllCampaigns.mockResolvedValue([]);

    const result = await cleanupOrphanAdImages();

    expect(result.orphans).toBe(0);
    expect(result.deleted).toBe(0);
    expect(result.skipped).toBe(false);
  });

  it("conta correttamente scanned includendo i file con sub-prefix", async () => {
    mockListObjects.mockResolvedValue([
      makeFile("toplevel.jpg"),
      { name: "public/ads/sub/nested.jpg", size: 100, createdTime: "2025-01-01T00:00:00Z" },
    ]);
    mockGetAllCampaigns.mockResolvedValue([makeCampaign("toplevel.jpg")]);

    const result = await cleanupOrphanAdImages();

    expect(result.scanned).toBe(2);
    expect(result.orphans).toBe(0);
    expect(result.deleted).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Logger opzionale
// ─────────────────────────────────────────────────────────────────────────────

describe("cleanupOrphanAdImages — logger opzionale", () => {
  it("chiama il logger per ogni fase rilevante", async () => {
    mockListObjects.mockResolvedValue([makeFile("keep.jpg"), makeFile("del.jpg")]);
    mockGetAllCampaigns.mockResolvedValue([makeCampaign("keep.jpg")]);

    const logLines: string[] = [];
    await cleanupOrphanAdImages({ log: (msg) => logLines.push(msg) });

    expect(logLines.some((l) => l.includes("2"))).toBe(true);
    expect(logLines.length).toBeGreaterThan(0);
  });

  it("funziona senza logger (default silenzioso)", async () => {
    mockListObjects.mockResolvedValue([makeFile("file.jpg")]);
    mockGetAllCampaigns.mockResolvedValue([makeCampaign("file.jpg")]);

    await expect(cleanupOrphanAdImages()).resolves.not.toThrow();
  });
});
