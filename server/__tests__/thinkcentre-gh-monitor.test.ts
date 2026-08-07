import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks — hoisted before the unit-under-test import.
//
// Mockiamo:
//  - `../db`                        → evita pool PG e side-effect al boot
//  - `@shared/db`                   → tabelle drizzle usate come riferimento
//  - `drizzle-orm`                  → `eq` passato a `.where()` (già mockato)
//  - `../push-notifications`        → verifica notifiche senza push reale
//  - `../lib/photon-client`         → non configurato di default
//  - `../graphhopper-client`        → ACTIVE_PROFILE + gate isSelfHosted
//  - `../routing/routing-area-state`→ getAreaEnabledMap controllabile per-test
//
// `global.fetch` è sostituito da `fetchMock` per controllare le risposte HTTP
// alle probe `/health` e `/route` delle singole aree.
// ---------------------------------------------------------------------------

const dbLimitMock = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const fetchMock = vi.hoisted(() => vi.fn());
const getAreaEnabledMapMock = vi.hoisted(() => vi.fn());
const sendPushMock = vi.hoisted(() => vi.fn().mockResolvedValue(0));

vi.mock("../db", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        // `where()` può essere terminale (await diretto → array) oppure
        // seguito da `.limit()`: l'oggetto restituito è sia un thenable che
        // risolve a [] sia portatore di `.limit` (dbLimitMock controllabile).
        where: vi.fn(() =>
          Object.assign(Promise.resolve([]), { limit: dbLimitMock }),
        ),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
  },
  withDbRetry: vi.fn(<T,>(fn: () => Promise<T>) => fn()),
}));

vi.mock("@shared/db", () => ({
  appSettings: { key: {}, value: {} },
  thinkcentreHealthEvents: {},
}));

vi.mock("drizzle-orm", () => ({ eq: vi.fn(), inArray: vi.fn() }));

vi.mock("../push-notifications", () => ({
  sendSystemAlertPushToAdmins: sendPushMock,
}));

vi.mock("../lib/photon-client", () => ({
  getPhotonHealthSnapshot: vi.fn().mockResolvedValue({ configured: false, ok: false }),
}));

vi.mock("../graphhopper-client", () => ({
  ACTIVE_PROFILE: "motorcycle",
  fetchSelfHostedProfiles: vi.fn().mockResolvedValue({ reachable: false }),
  isSelfHosted: false,
}));

vi.mock("../routing/routing-area-state", () => ({
  getAreaEnabledMap: getAreaEnabledMapMock,
}));

global.fetch = fetchMock as unknown as typeof fetch;

import {
  probeGraphHopperAreas,
  computeOverallStatus,
  stopThinkCentreMonitor,
  runThinkCentreProbe,
  type OverallStatus,
} from "../jobs/thinkcentre-monitor";
import { resetProbeEnvForTests, PROBE_ENV_VARS } from "../jobs/thinkcentre-monitor-probes";
import { ROUTING_AREAS, type RoutingAreaCode } from "@shared/routing-areas";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Mappa area → abilitato con tutti i valori a false di default. */
function enabledMap(overrides: Partial<Record<RoutingAreaCode, boolean>> = {}): Record<RoutingAreaCode, boolean> {
  const base = {} as Record<RoutingAreaCode, boolean>;
  for (const a of ROUTING_AREAS) base[a.codice] = false;
  return { ...base, ...overrides };
}

/** Risposta fetch HTTP OK (200). */
function fetchOk(): Response {
  return { status: 200 } as Response;
}

/** Risposta fetch HTTP KO (503). */
function fetchKo(): Response {
  return { status: 503 } as Response;
}

// ── Setup / Teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  stopThinkCentreMonitor();
  // Azzera in un colpo solo TUTTE le env var lette dalle probe (fonte di verità
  // in thinkcentre-monitor-probes.ts). Aggiungere una nuova probe non richiede
  // più di toccare questa lista: basta registrare la sua env var nel modulo.
  resetProbeEnvForTests();
  dbLimitMock.mockResolvedValue([]);
});

afterEach(() => {
  stopThinkCentreMonitor();
  vi.useRealTimers();
});

// =============================================================================
// Suite 1 — probeGraphHopperAreas: unitOk null / true / false
// =============================================================================

describe("probeGraphHopperAreas — GRAPHHOPPER_URL assente", () => {
  it("restituisce { unitOk: null, areas: [] } quando GRAPHHOPPER_URL non è impostato", async () => {
    const result = await probeGraphHopperAreas();
    expect(result).toEqual({ unitOk: null, areas: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("probeGraphHopperAreas — nessuna area abilitata", () => {
  it("restituisce { unitOk: null, areas: [] } quando tutte le aree sono disabilitate", async () => {
    process.env.GRAPHHOPPER_URL = "https://gh.example.org";
    getAreaEnabledMapMock.mockResolvedValue(enabledMap());

    const result = await probeGraphHopperAreas();

    expect(result).toEqual({ unitOk: null, areas: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("restituisce { unitOk: null, areas: [] } quando getAreaEnabledMap lancia errore e i default sono tutti false", async () => {
    process.env.GRAPHHOPPER_URL = "https://gh.example.org";
    getAreaEnabledMapMock.mockRejectedValue(new Error("db down"));

    const result = await probeGraphHopperAreas();

    // I default di ROUTING_AREAS: grecia, balcani, iberia, arco-alpino = true;
    // est, germania-centro, francia-benelux = false.
    // Quindi NON deve restituire unitOk: null, ma le 4 aree default-abilitate.
    // Questo verifica anche il fallback corretto (le aree abilitate di default vengono provate).
    expect(result.unitOk).not.toBeNull();
    expect(result.areas.length).toBeGreaterThan(0);
  });
});

describe("probeGraphHopperAreas — probe HTTP", () => {
  beforeEach(() => {
    process.env.GRAPHHOPPER_URL = "https://gh.example.org";
  });

  it("unitOk === true quando almeno un'area abilitata risponde con 200", async () => {
    getAreaEnabledMapMock.mockResolvedValue(
      enabledMap({ grecia: true, iberia: true }),
    );
    fetchMock.mockResolvedValue(fetchOk());

    const result = await probeGraphHopperAreas();

    expect(result.unitOk).toBe(true);
    expect(result.areas).toHaveLength(2);
    expect(result.areas.every((a) => a.ok === true)).toBe(true);
  });

  it("unitOk === false quando tutte le aree abilitate restituiscono errore", async () => {
    getAreaEnabledMapMock.mockResolvedValue(
      enabledMap({ grecia: true }),
    );
    fetchMock.mockResolvedValue(fetchKo());

    const result = await probeGraphHopperAreas();

    expect(result.unitOk).toBe(false);
    expect(result.areas).toHaveLength(1);
    expect(result.areas[0].ok).toBe(false);
  });

  it("unitOk === true anche se solo UNA area su più è online (OR logic)", async () => {
    getAreaEnabledMapMock.mockResolvedValue(
      enabledMap({ grecia: true, iberia: true, balcani: true }),
    );
    // Prima chiamata (grecia /health) ok, tutte le altre ko
    fetchMock
      .mockResolvedValueOnce(fetchOk())  // grecia /health
      .mockResolvedValue(fetchKo());     // iberia e balcani

    const result = await probeGraphHopperAreas();

    expect(result.unitOk).toBe(true);
  });

  it("unitOk === false quando fetch lancia per tutte le aree", async () => {
    getAreaEnabledMapMock.mockResolvedValue(
      enabledMap({ arco_alpino: true } as Partial<Record<RoutingAreaCode, boolean>>),
    );
    // Nota: il codice area è "arco-alpino", non "arco_alpino" — usiamo il valore corretto
    getAreaEnabledMapMock.mockResolvedValue(
      enabledMap({ "arco-alpino": true }),
    );
    fetchMock.mockRejectedValue(new Error("network error"));

    const result = await probeGraphHopperAreas();

    expect(result.unitOk).toBe(false);
    expect(result.areas[0].ok).toBe(false);
  });
});

// =============================================================================
// Suite 2 — Selezione sole aree abilitate
// =============================================================================

describe("probeGraphHopperAreas — selezione aree abilitate", () => {
  beforeEach(() => {
    process.env.GRAPHHOPPER_URL = "https://gh.example.org";
    fetchMock.mockResolvedValue(fetchOk());
  });

  it("include solo le aree abilitate in areas[] e ignora le disabilitate", async () => {
    getAreaEnabledMapMock.mockResolvedValue(
      enabledMap({ grecia: true, iberia: true }),
    );

    const result = await probeGraphHopperAreas();

    const keys = result.areas.map((a) => a.key);
    expect(keys).toContain("graphhopper:grecia");
    expect(keys).toContain("graphhopper:iberia");
    expect(keys).not.toContain("graphhopper:balcani");
    expect(keys).not.toContain("graphhopper:est");
    expect(keys).not.toContain("graphhopper:germania-centro");
    expect(keys).not.toContain("graphhopper:francia-benelux");
  });

  it("include tutte le aree in areas[] quando tutte sono abilitate", async () => {
    const all = enabledMap(
      Object.fromEntries(
        ROUTING_AREAS.map((a) => [a.codice, true]),
      ) as Partial<Record<RoutingAreaCode, boolean>>,
    );
    getAreaEnabledMapMock.mockResolvedValue(all);

    const result = await probeGraphHopperAreas();

    expect(result.areas).toHaveLength(ROUTING_AREAS.length);
  });

  it("le aree non abilitate non generano probe HTTP", async () => {
    getAreaEnabledMapMock.mockResolvedValue(
      enabledMap({ grecia: true }),
    );

    await probeGraphHopperAreas();

    // Solo la probe di grecia (/health) deve essere stata emessa
    const urls: string[] = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls.every((u) => u.includes("/areas/grecia"))).toBe(true);
  });

  it("key della area ha formato 'graphhopper:<codice>' e label 'GH · <nome>'", async () => {
    getAreaEnabledMapMock.mockResolvedValue(
      enabledMap({ balcani: true }),
    );

    const result = await probeGraphHopperAreas();

    expect(result.areas).toHaveLength(1);
    expect(result.areas[0].key).toBe("graphhopper:balcani");
    expect(result.areas[0].label).toBe("GH · Balcani");
  });

  it("aggiunge header X-GH-Token quando GRAPHHOPPER_TOKEN è impostato", async () => {
    process.env.GRAPHHOPPER_TOKEN = "my-secret-token";
    getAreaEnabledMapMock.mockResolvedValue(
      enabledMap({ grecia: true }),
    );

    await probeGraphHopperAreas();

    const call = fetchMock.mock.calls[0];
    const opts = call[1] as RequestInit;
    expect((opts.headers as Record<string, string>)["X-GH-Token"]).toBe("my-secret-token");
  });

  it("NON aggiunge header X-GH-Token quando GRAPHHOPPER_TOKEN non è impostato", async () => {
    getAreaEnabledMapMock.mockResolvedValue(
      enabledMap({ grecia: true }),
    );

    await probeGraphHopperAreas();

    const call = fetchMock.mock.calls[0];
    const opts = call[1] as RequestInit;
    expect((opts.headers as Record<string, string>)["X-GH-Token"]).toBeUndefined();
  });
});

// =============================================================================
// Suite 3 — computeOverallStatus (pura)
// =============================================================================

describe("computeOverallStatus — calcolo colore aggregato", () => {
  it("idle quando tutte le unità sono null (nessun servizio configurato)", () => {
    expect(computeOverallStatus([null, null, null, null, null])).toBe<OverallStatus>("idle");
  });

  it("idle con array vuoto", () => {
    expect(computeOverallStatus([])).toBe<OverallStatus>("idle");
  });

  it("green quando tutte le unità configurate sono true", () => {
    expect(computeOverallStatus([true, true, null])).toBe<OverallStatus>("green");
    expect(computeOverallStatus([true, true, true, true, true])).toBe<OverallStatus>("green");
  });

  it("red quando tutte le unità configurate sono false", () => {
    expect(computeOverallStatus([false, false, null])).toBe<OverallStatus>("red");
    expect(computeOverallStatus([false, false, false])).toBe<OverallStatus>("red");
  });

  it("yellow quando alcune unità configurate sono true e alcune false", () => {
    expect(computeOverallStatus([true, false, null])).toBe<OverallStatus>("yellow");
    expect(computeOverallStatus([true, false, false, null])).toBe<OverallStatus>("yellow");
    expect(computeOverallStatus([false, true])).toBe<OverallStatus>("yellow");
  });

  it("GH conta come singola unità logica: true+false+false+null+true → yellow non red", () => {
    // servizi singoli + GH unitOk
    // Scenario con servizi misti e GH=true
    // Configurati: [true, false, false, true] → 2/4 online → yellow
    expect(computeOverallStatus([true, false, false, null, true])).toBe<OverallStatus>("yellow");
  });

  it("GH conta come singola unità: anche con 7 aree, contribuisce un solo boolean", () => {
    // Se GH avesse 7 aree (tutte true), ma i 4 servizi singoli sono tutti null,
    // il risultato deve essere green (1 unità configurata: GH=true), non "7 servizi online"
    expect(computeOverallStatus([null, null, null, null, true])).toBe<OverallStatus>("green");
  });

  it("solo un servizio configurato: green se true, red se false", () => {
    expect(computeOverallStatus([null, null, null, null, true])).toBe<OverallStatus>("green");
    expect(computeOverallStatus([null, null, null, null, false])).toBe<OverallStatus>("red");
  });
});

// =============================================================================
// Suite 4 — Debounce notifiche per-area
// =============================================================================

describe("Debounce notifiche per-area GraphHopper", () => {
  beforeEach(() => {
    // Il beforeEach globale ha già azzerato TUTTE le env delle probe via
    // resetProbeEnvForTests(): qui basta abilitare GraphHopper. Le probe TCP
    // (Postgres/DragonflyDB) non aprono più socket reali sotto test (guard in
    // thinkcentre-monitor-probes.ts), quindi i fake timers non causano hang.
    process.env.GRAPHHOPPER_URL = "https://gh.example.org";
    vi.useFakeTimers();
  });

  it("invia una push quando un'area passa da ok a ko", async () => {
    getAreaEnabledMapMock.mockResolvedValue(enabledMap({ grecia: true }));

    // Prima run: area su → inizializza stato (nessuna notifica)
    fetchMock.mockResolvedValue(fetchOk());
    await runThinkCentreProbe();
    expect(sendPushMock).not.toHaveBeenCalled();

    // Seconda run: area giù → transizione ok→ko → push inviata
    fetchMock.mockResolvedValue(fetchKo());
    await runThinkCentreProbe();

    const perAreaCall = sendPushMock.mock.calls.find(
      (c) => typeof c[0] === "string" && c[0].includes("GH · Grecia"),
    );
    expect(perAreaCall).toBeDefined();
  });

  it("NON invia push per-area alla prima run (stato non ancora noto)", async () => {
    getAreaEnabledMapMock.mockResolvedValue(enabledMap({ grecia: true }));

    // Prima run con area già giù: nessuna push (stato precedente sconosciuto)
    fetchMock.mockResolvedValue(fetchKo());
    await runThinkCentreProbe();

    expect(sendPushMock).not.toHaveBeenCalled();
  });

  it("NON invia push per-area se AppSetting service push è disabilitato", async () => {
    getAreaEnabledMapMock.mockResolvedValue(enabledMap({ iberia: true }));

    // Run 1: area su → stato inizializzato
    fetchMock.mockResolvedValue(fetchOk());
    await runThinkCentreProbe();

    // Configura DB per restituire push disabilitato
    dbLimitMock.mockResolvedValue([{ value: "false" }]);

    // Run 2: area giù ma push disabilitato → nessuna push per-area
    fetchMock.mockResolvedValue(fetchKo());
    await runThinkCentreProbe();

    const perAreaCalls = sendPushMock.mock.calls.filter(
      (c) => typeof c[0] === "string" && c[0].includes("GH · Iberia"),
    );
    expect(perAreaCalls).toHaveLength(0);
  });

  it("NON invia push ripetuta entro debounce: ciclo ok→ko→ok→ko blocca la seconda notifica", async () => {
    // Il debounce per-area si attiva su transizioni ok→ko.
    // Se l'area torna online e poi va offline di nuovo entro 15 min, niente push.
    getAreaEnabledMapMock.mockResolvedValue(enabledMap({ grecia: true }));

    // Run 1: su → init
    fetchMock.mockResolvedValue(fetchOk());
    await runThinkCentreProbe();

    // Run 2: giù → prima push (debounce timer parte)
    fetchMock.mockResolvedValue(fetchKo());
    await runThinkCentreProbe();

    const countFirst = sendPushMock.mock.calls.filter(
      (c) => typeof c[0] === "string" && c[0].includes("GH · Grecia"),
    ).length;
    expect(countFirst).toBe(1);

    // Run 3: di nuovo su → nessuna push (ko→ok non genera notifica per-area)
    fetchMock.mockResolvedValue(fetchOk());
    await runThinkCentreProbe();

    // Run 4: giù di nuovo, entro 15 min dal debounce → NO push
    fetchMock.mockResolvedValue(fetchKo());
    await runThinkCentreProbe();

    const countAfterDebounce = sendPushMock.mock.calls.filter(
      (c) => typeof c[0] === "string" && c[0].includes("GH · Grecia"),
    ).length;
    expect(countAfterDebounce).toBe(1); // ancora 1, nessuna seconda push
  });

  it("invia di nuovo push per-area dopo la scadenza del debounce (ciclo ok→ko→ok→ko)", async () => {
    // Dopo > 15 min, un secondo ok→ko deve generare una nuova push.
    getAreaEnabledMapMock.mockResolvedValue(enabledMap({ balcani: true }));

    // Run 1: su → init
    fetchMock.mockResolvedValue(fetchOk());
    await runThinkCentreProbe();

    // Run 2: giù → prima push
    fetchMock.mockResolvedValue(fetchKo());
    await runThinkCentreProbe();

    const countAfterFirst = sendPushMock.mock.calls.filter(
      (c) => typeof c[0] === "string" && c[0].includes("GH · Balcani"),
    ).length;
    expect(countAfterFirst).toBe(1);

    // Run 3: su di nuovo
    fetchMock.mockResolvedValue(fetchOk());
    await runThinkCentreProbe();

    // Avanza il clock oltre il debounce di 15 min
    vi.advanceTimersByTime(16 * 60 * 1000);

    // Run 4: giù di nuovo, debounce scaduto → seconda push
    fetchMock.mockResolvedValue(fetchKo());
    await runThinkCentreProbe();

    const countAfterSecond = sendPushMock.mock.calls.filter(
      (c) => typeof c[0] === "string" && c[0].includes("GH · Balcani"),
    ).length;
    expect(countAfterSecond).toBe(2);
  });
});

// =============================================================================
// Suite 5 — PROBE_ENV_VARS parity (fail loud quando una probe nuova è dimenticata)
// =============================================================================

describe("PROBE_ENV_VARS — parità con le env lette dalle probe", () => {
  // Env NON di probe lette nel modulo (test-mode guard): vanno escluse dal check.
  // THINKCENTRE_METRICS_URL è letto SOLO da logTcProbeEndpoints() (log di boot
  // diagnostico), non da una probe: non richiede isolamento via
  // resetProbeEnvForTests, quindi non va in PROBE_ENV_VARS.
  const NON_PROBE_ENV = new Set(["VITEST", "NODE_ENV", "THINKCENTRE_METRICS_URL"]);

  it("ogni process.env.X letto in thinkcentre-monitor-probes.ts è registrato in PROBE_ENV_VARS", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const raw = fs.readFileSync(
      path.resolve(__dirname, "../jobs/thinkcentre-monitor-probes.ts"),
      "utf8",
    );
    // Rimuovi i commenti (block /* */ e line //) per non catturare gli esempi
    // come `delete process.env.X` nelle docstring.
    const src = raw
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");

    const referenced = new Set<string>();
    for (const m of src.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
      const name = m[1];
      if (!NON_PROBE_ENV.has(name)) referenced.add(name);
    }

    const registered = new Set<string>(PROBE_ENV_VARS);
    const missing = [...referenced].filter((name) => !registered.has(name));

    // Se questo fallisce: hai aggiunto una probe che legge una env var senza
    // registrarla in PROBE_ENV_VARS → il test di isolamento non la azzererebbe.
    expect(missing).toEqual([]);
  });
});
