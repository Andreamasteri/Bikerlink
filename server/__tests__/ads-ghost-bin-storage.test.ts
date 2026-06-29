/**
 * Tests: AdsStorage — ghost-bin e restore flow
 *
 * Logica coperta:
 *  - getActiveCampaigns usa isNull(ghostedAt) come filtro WHERE
 *  - getActiveAdsByUserType usa isNull(ghostedAt) come filtro WHERE
 *  - ghostCampaign imposta ghostedAt a sql`NOW()` (non null)
 *  - restoreCampaign imposta ghostedAt a null e ritorna la riga aggiornata
 *  - restoreCampaign ritorna undefined se la campagna non esiste
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// ── Hoisted setup ─────────────────────────────────────────────────────────────

vi.hoisted(() => {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || "postgres://test:test@localhost:5432/test"; // pragma: allowlist secret
});

const { mockDbSelect, mockDbUpdate } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
}));

// ── Mock: database ────────────────────────────────────────────────────────────

vi.mock("../db", () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
    insert: vi.fn(),
    delete: vi.fn(),
  },
}));

// ── Mock: classe base dello storage (evita catena di import non necessari) ────

vi.mock("../storage/social", () => ({
  SocialStorage: class {},
}));

// ── Mock: drizzle-orm — preserva il comportamento reale, spia isNull/isNotNull

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    isNull: vi.fn((...args: Parameters<typeof actual.isNull>) =>
      actual.isNull(...args)
    ),
    isNotNull: vi.fn((...args: Parameters<typeof actual.isNotNull>) =>
      actual.isNotNull(...args)
    ),
  };
});

// ── Imports (dopo i mock) ─────────────────────────────────────────────────────

import { AdsStorage } from "../storage/ads";
import { adCampaigns } from "@shared/db";
import { isNull } from "drizzle-orm";

// ── Istanza del subject ───────────────────────────────────────────────────────

const adsStorage = new AdsStorage();

// ── Helpers per mock chain drizzle ────────────────────────────────────────────

function makeSelectChain(rows: unknown[]) {
  const where = vi.fn().mockResolvedValue(rows);
  const from = vi.fn().mockReturnValue({ where });
  mockDbSelect.mockReturnValue({ from });
  return { where, from };
}

function makeSelectChainWithOrderBy(rows: unknown[]) {
  const orderBy = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });
  mockDbSelect.mockReturnValue({ from });
  return { where, from, orderBy };
}

function makeUpdateChain(returning: unknown[] = []) {
  const returningFn = vi.fn().mockResolvedValue(returning);
  const where = vi.fn().mockReturnValue({ returning: returningFn });
  const set = vi.fn().mockReturnValue({ where });
  mockDbUpdate.mockReturnValue({ set });
  return { set, where, returning: returningFn };
}

function makeUpdateChainNoReturning() {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn().mockReturnValue({ where });
  mockDbUpdate.mockReturnValue({ set });
  return { set, where };
}

// ── Reset tra i test ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// getActiveCampaigns — filtro isNull(ghostedAt)
// ─────────────────────────────────────────────────────────────────────────────

describe("AdsStorage.getActiveCampaigns — filtro ghost-bin", () => {
  it("applica isNull(adCampaigns.ghostedAt) nella WHERE clause", async () => {
    makeSelectChain([]);

    await adsStorage.getActiveCampaigns();

    expect(vi.mocked(isNull)).toHaveBeenCalledWith(adCampaigns.ghostedAt);
  });

  it("ritorna le campagne restituite dal DB (campagne non ghostate)", async () => {
    const activeCampaign = { id: "1", name: "Active", isActive: true, ghostedAt: null };
    makeSelectChain([activeCampaign]);

    const result = await adsStorage.getActiveCampaigns();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("ritorna un array vuoto se il DB non trova campagne", async () => {
    makeSelectChain([]);

    const result = await adsStorage.getActiveCampaigns();

    expect(result).toEqual([]);
  });

  it("chiama db.select().from(adCampaigns) come tabella sorgente", async () => {
    const { from } = makeSelectChain([]);

    await adsStorage.getActiveCampaigns();

    expect(from).toHaveBeenCalledWith(adCampaigns);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getActiveAdsByUserType — filtro isNull(ghostedAt)
// ─────────────────────────────────────────────────────────────────────────────

describe("AdsStorage.getActiveAdsByUserType — filtro ghost-bin", () => {
  it("applica isNull(adCampaigns.ghostedAt) nella WHERE clause", async () => {
    makeSelectChainWithOrderBy([]);

    await adsStorage.getActiveAdsByUserType("biker");

    expect(vi.mocked(isNull)).toHaveBeenCalledWith(adCampaigns.ghostedAt);
  });

  it("ritorna le campagne restituite dal DB per il tipo utente specificato", async () => {
    const campaign = {
      id: "2",
      name: "Biker Ad",
      isActive: true,
      ghostedAt: null,
      targetUserType: "biker",
    };
    makeSelectChainWithOrderBy([campaign]);

    const result = await adsStorage.getActiveAdsByUserType("biker");

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("2");
  });

  it("ritorna un array vuoto se il DB non restituisce campagne", async () => {
    makeSelectChainWithOrderBy([]);

    const result = await adsStorage.getActiveAdsByUserType("zavorrina");

    expect(result).toEqual([]);
  });

  it("chiama db.select().from(adCampaigns) come tabella sorgente", async () => {
    const { from } = makeSelectChainWithOrderBy([]);

    await adsStorage.getActiveAdsByUserType("biker");

    expect(from).toHaveBeenCalledWith(adCampaigns);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ghostCampaign — setta ghostedAt a sql`NOW()`
// ─────────────────────────────────────────────────────────────────────────────

describe("AdsStorage.ghostCampaign", () => {
  it("chiama db.update(adCampaigns) con la tabella corretta", async () => {
    makeUpdateChainNoReturning();

    await adsStorage.ghostCampaign("campaign-abc");

    expect(mockDbUpdate).toHaveBeenCalledWith(adCampaigns);
  });

  it("imposta ghostedAt a un valore SQL non-null (NOW())", async () => {
    const { set } = makeUpdateChainNoReturning();

    await adsStorage.ghostCampaign("campaign-abc");

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ ghostedAt: expect.anything() })
    );
    const setArg = set.mock.calls[0][0] as { ghostedAt: unknown };
    expect(setArg.ghostedAt).not.toBeNull();
    expect(setArg.ghostedAt).not.toBeUndefined();
  });

  it("NON imposta ghostedAt a null (deve usare sql`NOW()`, non cancellarlo)", async () => {
    const { set } = makeUpdateChainNoReturning();

    await adsStorage.ghostCampaign("campaign-xyz");

    const setArg = set.mock.calls[0][0] as { ghostedAt: unknown };
    expect(setArg.ghostedAt).not.toBeNull();
  });

  it("chiama where per filtrare sull'id campagna corretto", async () => {
    const { where } = makeUpdateChainNoReturning();

    await adsStorage.ghostCampaign("campaign-target");

    expect(where).toHaveBeenCalledTimes(1);
  });

  it("ghostCampaign su ID diversi chiama sempre set() con ghostedAt non-null", async () => {
    for (const id of ["id-A", "id-B", "id-C"]) {
      const { set } = makeUpdateChainNoReturning();

      await adsStorage.ghostCampaign(id);

      const setArg = set.mock.calls[0][0] as { ghostedAt: unknown };
      expect(setArg.ghostedAt).not.toBeNull();
      vi.clearAllMocks();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// restoreCampaign — azzera ghostedAt (null)
// ─────────────────────────────────────────────────────────────────────────────

describe("AdsStorage.restoreCampaign", () => {
  it("imposta ghostedAt a null (rimuove la campagna dal ghost-bin)", async () => {
    const { set } = makeUpdateChain([{ id: "campaign-abc", ghostedAt: null }]);

    await adsStorage.restoreCampaign("campaign-abc");

    expect(set).toHaveBeenCalledWith({ ghostedAt: null });
  });

  it("ritorna la campagna aggiornata con ghostedAt = null", async () => {
    const updatedCampaign = {
      id: "camp-1",
      name: "Restored",
      ghostedAt: null,
      isActive: true,
    };
    makeUpdateChain([updatedCampaign]);

    const result = await adsStorage.restoreCampaign("camp-1");

    expect(result).toEqual(updatedCampaign);
    expect(result!.ghostedAt).toBeNull();
  });

  it("ritorna undefined se la campagna non esiste nel DB (returning vuoto)", async () => {
    makeUpdateChain([]); // nessuna riga aggiornata

    const result = await adsStorage.restoreCampaign("nonexistent-id");

    expect(result).toBeUndefined();
  });

  it("chiama db.update(adCampaigns) con la tabella corretta", async () => {
    makeUpdateChain([{ id: "x", ghostedAt: null }]);

    await adsStorage.restoreCampaign("x");

    expect(mockDbUpdate).toHaveBeenCalledWith(adCampaigns);
  });

  it("usa .returning() per ottenere la riga aggiornata", async () => {
    const { returning } = makeUpdateChain([{ id: "r1", ghostedAt: null }]);

    await adsStorage.restoreCampaign("r1");

    expect(returning).toHaveBeenCalledTimes(1);
  });

  it("ripristinare una campagna imposta esattamente { ghostedAt: null }, non altro", async () => {
    const { set } = makeUpdateChain([{ id: "c", ghostedAt: null }]);

    await adsStorage.restoreCampaign("c");

    expect(set).toHaveBeenCalledWith({ ghostedAt: null });
    expect(set).not.toHaveBeenCalledWith(
      expect.objectContaining({ ghostedAt: expect.anything() })
    );
  });
});
