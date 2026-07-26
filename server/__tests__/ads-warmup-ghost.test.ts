/**
 * Tests: warmupAdImageCache() — ghost-bin dopo fallimento immagine
 *
 * Logica coperta:
 *  - ghostCampaign è chiamata quando sia il download primario che il backup falliscono
 *  - ghostCampaign NON è chiamata se il primario ha successo
 *  - ghostCampaign NON è chiamata se il backup ha successo dopo il fallimento del primario
 *  - Le campagne con file già in cache locale vengono saltate (no download, no ghost)
 *  - Le campagne inattive vengono saltate
 *  - Le campagne senza imageUrl vengono saltate
 *  - imageUrl in formato non riconosciuto viene saltato
 *  - ghostCampaign che fallisce non blocca il warmup (non-fatal)
 *  - Solo le campagne irrecuperabili vengono ghostate, non quelle con successo
 */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// ── Hoisted mock factories ─────────────────────────────────────────────────────

const {
  mockGetAllCampaigns,
  mockGhostCampaign,
  mockDownloadBuffer,
  mockUploadBuffer,
  mockFsExistsSync,
  mockFsMkdirSync,
  mockFsWriteFileSync,
} = vi.hoisted(() => ({
  mockGetAllCampaigns: vi.fn(),
  mockGhostCampaign: vi.fn(),
  mockDownloadBuffer: vi.fn(),
  mockUploadBuffer: vi.fn(),
  mockFsExistsSync: vi.fn(),
  mockFsMkdirSync: vi.fn(),
  mockFsWriteFileSync: vi.fn(),
}));

// ── Mock: storage ─────────────────────────────────────────────────────────────

vi.mock("../storage", () => ({
  storage: {
    getAllCampaigns: mockGetAllCampaigns,
    ghostCampaign: mockGhostCampaign,
  },
}));

// ── Mock: object storage ──────────────────────────────────────────────────────

vi.mock("../objectStorage", () => ({
  downloadBuffer: mockDownloadBuffer,
  uploadBuffer: mockUploadBuffer,
  deleteObject: vi.fn(),
  listObjects: vi.fn(),
  BUCKET_CAMPAIGN: "Campaign/",
}));

// ── Mock: fs (default export — usato come `import fs from "fs"`) ──────────────

vi.mock("fs", () => ({
  default: {
    existsSync: mockFsExistsSync,
    mkdirSync: mockFsMkdirSync,
    writeFileSync: mockFsWriteFileSync,
    readdirSync: vi.fn().mockReturnValue([]),
    unlinkSync: vi.fn(),
  },
}));

// ── Import dopo i mock ────────────────────────────────────────────────────────

import { warmupAdImageCache } from "../routes/ads";

// ── Helper: campagna fittizia ─────────────────────────────────────────────────

function makeCampaign(
  id: string,
  overrides: Partial<{
    name: string;
    isActive: boolean;
    imageUrl: string | null;
    ghostedAt: Date | null;
  }> = {}
) {
  return {
    id,
    name: overrides.name ?? `Campagna ${id}`,
    isActive: overrides.isActive ?? true,
    imageUrl: overrides.imageUrl !== undefined ? overrides.imageUrl : `/api/ads/images/${id}.jpg`,
    ghostedAt: overrides.ghostedAt ?? null,
  };
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mockGhostCampaign.mockResolvedValue(undefined);
  mockFsExistsSync.mockReturnValue(false); // nessun file in cache locale
  mockFsMkdirSync.mockReturnValue(undefined);
  mockFsWriteFileSync.mockReturnValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

// Helper: avvia warmup e avanza tutti i timer pendenti (500ms delay tra campagne)
async function runWarmup(): Promise<void> {
  const p = warmupAdImageCache();
  await vi.runAllTimersAsync();
  await p;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ghost dopo doppio fallimento (primario + backup)
// ─────────────────────────────────────────────────────────────────────────────

describe("warmupAdImageCache — ghosting dopo fallimento completo", () => {
  it("chiama ghostCampaign se sia il primario che il backup falliscono", async () => {
    mockGetAllCampaigns.mockResolvedValue([makeCampaign("camp-001")]);
    mockDownloadBuffer.mockRejectedValue(new Error("Object Storage non disponibile"));

    await runWarmup();

    expect(mockGhostCampaign).toHaveBeenCalledTimes(1);
    expect(mockGhostCampaign).toHaveBeenCalledWith("camp-001");
  });

  it("ghosta con l'ID esatto della campagna irrecuperabile", async () => {
    const targetId = "specific-campaign-id-42";
    mockGetAllCampaigns.mockResolvedValue([makeCampaign(targetId)]);
    mockDownloadBuffer.mockRejectedValue(new Error("storage fail"));

    await runWarmup();

    expect(mockGhostCampaign).toHaveBeenCalledWith(targetId);
    expect(mockGhostCampaign).not.toHaveBeenCalledWith(expect.stringContaining("wrong"));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Nessun ghost se il download ha successo
// ─────────────────────────────────────────────────────────────────────────────

describe("warmupAdImageCache — nessun ghost se immagine recuperata", () => {
  it("NON chiama ghostCampaign se il download dal primario ha successo", async () => {
    mockGetAllCampaigns.mockResolvedValue([makeCampaign("camp-003")]);
    mockDownloadBuffer.mockResolvedValue(Buffer.from("image data"));

    await runWarmup();

    expect(mockGhostCampaign).not.toHaveBeenCalled();
    expect(mockFsWriteFileSync).toHaveBeenCalled();
  });

  it("NON chiama ghostCampaign se il backup ha successo dopo il fallimento del primario", async () => {
    mockGetAllCampaigns.mockResolvedValue([makeCampaign("camp-004")]);
    mockDownloadBuffer
      .mockRejectedValueOnce(new Error("new primary fail"))
      .mockRejectedValueOnce(new Error("legacy primary fail"))
      .mockResolvedValueOnce(Buffer.from("backup data")); // backup ok

    await runWarmup();

    expect(mockGhostCampaign).not.toHaveBeenCalled();
    expect(mockFsWriteFileSync).toHaveBeenCalled();
  });

  it("scrive il file su disco quando il primario ha successo", async () => {
    mockGetAllCampaigns.mockResolvedValue([makeCampaign("camp-write")]);
    const imageData = Buffer.from("image bytes");
    mockDownloadBuffer.mockResolvedValue(imageData);

    await runWarmup();

    expect(mockFsWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining("camp-write.jpg"),
      imageData
    );
  });

  it("scrive il file su disco quando il backup ha successo", async () => {
    mockGetAllCampaigns.mockResolvedValue([makeCampaign("camp-backup-write")]);
    const backupData = Buffer.from("backup bytes");
    mockDownloadBuffer
      .mockRejectedValueOnce(new Error("new primary fail"))
      .mockRejectedValueOnce(new Error("legacy primary fail"))
      .mockResolvedValueOnce(backupData);
    mockUploadBuffer.mockResolvedValue(undefined);

    await runWarmup();

    expect(mockFsWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining("camp-backup-write.jpg"),
      backupData
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Campagne saltate (skip senza download né ghost)
// ─────────────────────────────────────────────────────────────────────────────

describe("warmupAdImageCache — campagne saltate", () => {
  it("non scarica né ghosta se il file esiste già in cache locale", async () => {
    mockGetAllCampaigns.mockResolvedValue([makeCampaign("camp-cached")]);
    mockFsExistsSync.mockReturnValue(true); // file già in cache locale

    await runWarmup();

    expect(mockDownloadBuffer).not.toHaveBeenCalled();
    expect(mockGhostCampaign).not.toHaveBeenCalled();
  });

  it("non scarica né ghosta le campagne inattive (isActive = false)", async () => {
    mockGetAllCampaigns.mockResolvedValue([
      makeCampaign("inactive-camp", { isActive: false }),
    ]);

    await runWarmup();

    expect(mockDownloadBuffer).not.toHaveBeenCalled();
    expect(mockGhostCampaign).not.toHaveBeenCalled();
  });

  it("non scarica né ghosta le campagne senza imageUrl", async () => {
    mockGetAllCampaigns.mockResolvedValue([
      makeCampaign("no-image", { imageUrl: null }),
    ]);

    await runWarmup();

    expect(mockDownloadBuffer).not.toHaveBeenCalled();
    expect(mockGhostCampaign).not.toHaveBeenCalled();
  });

  it("non scarica né ghosta se imageUrl ha un formato non riconosciuto", async () => {
    mockGetAllCampaigns.mockResolvedValue([
      makeCampaign("ext-url", { imageUrl: "https://cdn.example.com/ad.jpg" }),
    ]);

    await runWarmup();

    expect(mockDownloadBuffer).not.toHaveBeenCalled();
    expect(mockGhostCampaign).not.toHaveBeenCalled();
  });

  it("non scarica né ghosta se il filename contiene path traversal (..)", async () => {
    mockGetAllCampaigns.mockResolvedValue([
      makeCampaign("traversal", { imageUrl: "/api/ads/images/../../etc/passwd" }),
    ]);

    await runWarmup();

    expect(mockDownloadBuffer).not.toHaveBeenCalled();
    expect(mockGhostCampaign).not.toHaveBeenCalled();
  });

  it("non scarica né ghosta se il filename contiene / (sub-path)", async () => {
    mockGetAllCampaigns.mockResolvedValue([
      makeCampaign("subpath", { imageUrl: "/api/ads/images/sub/folder/ad.jpg" }),
    ]);

    await runWarmup();

    expect(mockDownloadBuffer).not.toHaveBeenCalled();
    expect(mockGhostCampaign).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Isolamento: ghost solo campagne irrecuperabili, non quelle con successo
// ─────────────────────────────────────────────────────────────────────────────

describe("warmupAdImageCache — isolamento ghost tra campagne", () => {
  it("ghosta solo la campagna irrecuperabile, non quelle ripristinate", async () => {
    const okCampaign = makeCampaign("ok-camp");
    const badCampaign = makeCampaign("bad-camp");
    mockGetAllCampaigns.mockResolvedValue([okCampaign, badCampaign]);

    mockDownloadBuffer
      .mockResolvedValueOnce(Buffer.from("ok image")) // primario ok-camp → successo
      .mockRejectedValueOnce(new Error("bad new primary"))
      .mockRejectedValueOnce(new Error("bad legacy primary"))
      .mockRejectedValueOnce(new Error("bad backup")); // backup bad-camp → fallisce

    await runWarmup();

    expect(mockGhostCampaign).toHaveBeenCalledTimes(1);
    expect(mockGhostCampaign).toHaveBeenCalledWith("bad-camp");
    expect(mockGhostCampaign).not.toHaveBeenCalledWith("ok-camp");
  });

  it("ghosta tutte le campagne irrecuperabili in un batch misto", async () => {
    const camps = [
      makeCampaign("good-1"),
      makeCampaign("bad-1"),
      makeCampaign("bad-2"),
    ];
    mockGetAllCampaigns.mockResolvedValue(camps);

    mockDownloadBuffer
      .mockResolvedValueOnce(Buffer.from("ok")) // good-1 primario ok
      .mockRejectedValueOnce(new Error("fail"))  // bad-1 nuovo primario
      .mockRejectedValueOnce(new Error("fail"))  // bad-1 primario legacy
      .mockRejectedValueOnce(new Error("fail"))  // bad-1 backup
      .mockRejectedValueOnce(new Error("fail"))  // bad-2 nuovo primario
      .mockRejectedValueOnce(new Error("fail"))  // bad-2 primario legacy
      .mockRejectedValueOnce(new Error("fail")); // bad-2 backup

    await runWarmup();

    expect(mockGhostCampaign).toHaveBeenCalledTimes(2);
    expect(mockGhostCampaign).toHaveBeenCalledWith("bad-1");
    expect(mockGhostCampaign).toHaveBeenCalledWith("bad-2");
    expect(mockGhostCampaign).not.toHaveBeenCalledWith("good-1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Robustezza — errori non bloccanti
// ─────────────────────────────────────────────────────────────────────────────

describe("warmupAdImageCache — robustezza", () => {
  it("ghostCampaign che fallisce non blocca il warmup (non-fatal)", async () => {
    mockGetAllCampaigns.mockResolvedValue([makeCampaign("ghost-fail")]);
    mockDownloadBuffer.mockRejectedValue(new Error("storage error"));
    mockGhostCampaign.mockRejectedValue(new Error("ghost DB error"));

    await expect(runWarmup()).resolves.toBeUndefined();
  });

  it("completato anche se getAllCampaigns restituisce 0 campagne", async () => {
    mockGetAllCampaigns.mockResolvedValue([]);

    await expect(runWarmup()).resolves.toBeUndefined();

    expect(mockDownloadBuffer).not.toHaveBeenCalled();
    expect(mockGhostCampaign).not.toHaveBeenCalled();
  });

  it("completato senza ghost se tutte le campagne sono già in cache", async () => {
    mockGetAllCampaigns.mockResolvedValue([
      makeCampaign("c1"),
      makeCampaign("c2"),
    ]);
    mockFsExistsSync.mockReturnValue(true); // tutte in cache

    await expect(runWarmup()).resolves.toBeUndefined();

    expect(mockGhostCampaign).not.toHaveBeenCalled();
    expect(mockDownloadBuffer).not.toHaveBeenCalled();
  });
});
