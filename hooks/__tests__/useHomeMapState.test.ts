/**
 * Test di regressione per gli handler della schermata mappa home.
 *
 * Contesto (Task #5111): la catena split è stata fusa in un unico file
 * `hooks/home/useHomeMapState.ts` (>600 righe, marcato @no-split). Futuri edit
 * pesanti su questo file potrebbero rompere in SILENZIO la logica chiave degli
 * handler senza che nessun test lo rilevi. Questo test blinda i comportamenti
 * dell'unico punto della schermata mappa:
 *
 *   - handleSearch     → filtro < 2 char, esclusione self, set risultati
 *   - handleLocateUser → chiusura liste + focus mappa ritardato (300ms)
 *   - handleAdClick    → normalizzazione URL (prepend https) + apertura Linking
 *   - getAreaLabel     → mondo / continente / singolo paese / N paesi
 *
 * Contesto (Task #5112): lo stesso file ospita anche `useHomeMapCalculated`,
 * che produce i valori DERIVATI della mappa (chi mostrare e dove centrare). Un
 * edit pesante potrebbe romperli in silenzio. Blindiamo:
 *
 *   - usersWithSelf         → inietta l'utente corrente se assente, senza duplicarlo
 *   - smallMapInitialCenter → media coordinate visibili con filtri attivi,
 *                             fallback alle coord profilo salvate, null se nessuna
 *   - mySearchRadius        → 0 senza proposte attive, altrimenti il max searchRadius
 *
 * Strategia: `useHomeMapHandlers` e `getAreaLabel` sono funzioni pure (nessun
 * hook React al loro interno), quindi si invocano direttamente. Mockiamo solo
 * le dipendenze di modulo che non caricano in ambiente node (react-native,
 * expo-router, context, hook mappa, query-client, AsyncStorage). NON mockiamo
 * `@/lib/countries-regions`: getAreaLabel viene testato contro i dati reali.
 * `useHomeMapCalculated` usa `useMemo`, quindi va montato in un reconciler React
 * reale (react-test-renderer) tramite una sonda che cattura il valore restituito.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";

// ── mock: dipendenze di modulo non caricabili in node ────────────────────────
const apiRequest = vi.hoisted(() => vi.fn());
const openURL = vi.hoisted(() => vi.fn());

vi.mock("react-native", () => {
  const makeAnim = () => ({ start: (cb?: () => void) => cb && cb() });
  return {
    Animated: {
      Value: class {
        constructor(public _v: number) {}
      },
      timing: () => makeAnim(),
      delay: () => makeAnim(),
      sequence: () => makeAnim(),
    },
    Linking: { openURL },
    Alert: { alert: vi.fn() },
  };
});

vi.mock("expo-router", () => ({
  useRouter: () => ({}),
  useLocalSearchParams: () => ({}),
  useFocusEffect: () => {},
}));

vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({}) }));
vi.mock("@/lib/location-context", () => ({ useLocationGate: () => ({}) }));
vi.mock("@/lib/settings-context", () => ({ useSetting: () => false }));
vi.mock("@/lib/language-context", () => ({ useT: () => (k: string) => k }));
vi.mock("@/hooks/useMapFilters", () => ({ useMapFilters: () => ({}) }));
vi.mock("@/hooks/useMapLocation", () => ({ useMapLocation: () => ({}) }));
vi.mock("@/hooks/useMapData", () => ({ useMapData: () => ({}) }));
vi.mock("@/lib/startup-beacon", () => ({ sendStartupBeacon: vi.fn() }));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() },
}));
vi.mock("@/lib/query-client", () => ({
  apiRequest,
  queryClient: { invalidateQueries: vi.fn() },
}));

import { useHomeMapHandlers, getAreaLabel, useHomeMapCalculated } from "../home/useHomeMapState";
import { CONTINENT_MAP } from "@/lib/countries-regions";

// ── factory: handlers con un set fresco di spie ──────────────────────────────
function makeHandlers(user: { id?: string } | null = { id: "me" }) {
  const spies = {
    setSelectedUser: vi.fn(),
    setDetailLoading: vi.fn(),
    setSelectedUserDetail: vi.fn(),
    setSelectedUserProposals: vi.fn(),
    setSelectedEgg: vi.fn(),
    setSearchText: vi.fn(),
    setSearchResults: vi.fn(),
    setShowSearchResults: vi.fn(),
    setSearchLoading: vi.fn(),
    router: { push: vi.fn() },
    setShowOnlineList: vi.fn(),
    setShowBikerList: vi.fn(),
    setShowZavorrinaList: vi.fn(),
    setLastSmallMapCenter: vi.fn(),
    focusOnCoordinate: vi.fn(),
    setFocusToast: vi.fn(),
  };
  const mapRef = { current: { focusOnCoordinate: spies.focusOnCoordinate } };
  const focusToastAnim = {};
  // useHomeMapHandlers è una factory pura (non un hook React): la invochiamo
  // direttamente nel test, quindi le rules-of-hooks non si applicano.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const handlers = useHomeMapHandlers(
    spies.setSelectedUser,
    spies.setDetailLoading,
    spies.setSelectedUserDetail,
    spies.setSelectedUserProposals,
    spies.setSelectedEgg,
    spies.setSearchText,
    spies.setSearchResults,
    spies.setShowSearchResults,
    spies.setSearchLoading,
    user,
    spies.router,
    spies.setShowOnlineList,
    spies.setShowBikerList,
    spies.setShowZavorrinaList,
    spies.setLastSmallMapCenter,
    mapRef,
    spies.setFocusToast,
    focusToastAnim,
  );
  return { handlers, spies };
}

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockResolvedValue({ json: async () => [] });
  openURL.mockReset();
  openURL.mockResolvedValue(undefined);
});

// ══════════════════════════════════════════════════════════════════════════
// handleSearch
// ══════════════════════════════════════════════════════════════════════════
describe("handleSearch", () => {
  it("query < 2 caratteri: azzera i risultati, chiude la lista, nessuna chiamata API", async () => {
    const { handlers, spies } = makeHandlers();
    await handlers.handleSearch("a");
    expect(spies.setSearchText).toHaveBeenCalledWith("a");
    expect(spies.setSearchResults).toHaveBeenCalledWith([]);
    expect(spies.setShowSearchResults).toHaveBeenCalledWith(false);
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("query valida: chiama l'API e mostra i risultati", async () => {
    apiRequest.mockResolvedValue({
      json: async () => [{ id: "u1" }, { id: "u2" }],
    });
    const { handlers, spies } = makeHandlers({ id: "me" });
    await handlers.handleSearch("mario");
    expect(spies.setShowSearchResults).toHaveBeenCalledWith(true);
    expect(apiRequest).toHaveBeenCalledWith(
      "GET",
      "/api/users/search?q=mario",
    );
    expect(spies.setSearchResults).toHaveBeenLastCalledWith([
      { id: "u1" },
      { id: "u2" },
    ]);
  });

  it("esclude se stessi dai risultati di ricerca", async () => {
    apiRequest.mockResolvedValue({
      json: async () => [{ id: "me" }, { id: "u2" }],
    });
    const { handlers, spies } = makeHandlers({ id: "me" });
    await handlers.handleSearch("mario");
    expect(spies.setSearchResults).toHaveBeenLastCalledWith([{ id: "u2" }]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// handleLocateUser
// ══════════════════════════════════════════════════════════════════════════
describe("handleLocateUser", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("chiude tutte le liste e memorizza il centro mappa subito", () => {
    const { handlers, spies } = makeHandlers();
    handlers.handleLocateUser({ id: "u9", nickname: "Joe", latitude: "45.1", longitude: "9.2" });
    expect(spies.setShowOnlineList).toHaveBeenCalledWith(false);
    expect(spies.setShowBikerList).toHaveBeenCalledWith(false);
    expect(spies.setShowZavorrinaList).toHaveBeenCalledWith(false);
    expect(spies.setLastSmallMapCenter).toHaveBeenCalledWith({
      latitude: 45.1,
      longitude: 9.2,
    });
    // il focus è ritardato: non deve scattare prima del timer
    expect(spies.focusOnCoordinate).not.toHaveBeenCalled();
  });

  it("centra la mappa sull'utente dopo il ritardo (300ms)", () => {
    const { handlers, spies } = makeHandlers();
    handlers.handleLocateUser({ id: "u9", nickname: "Joe", latitude: "45.1", longitude: "9.2" });
    vi.advanceTimersByTime(300);
    expect(spies.focusOnCoordinate).toHaveBeenCalledWith({
      latitude: 45.1,
      longitude: 9.2,
      userId: "u9",
    });
    // nickname presente → mostra il toast di focus
    expect(spies.setFocusToast).toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// handleAdClick
// ══════════════════════════════════════════════════════════════════════════
describe("handleAdClick", () => {
  it("registra il click e apre l'URL aggiungendo https:// se manca lo schema", async () => {
    const { handlers } = makeHandlers();
    await handlers.handleAdClick({ id: "ad1", linkUrl: "example.com" });
    expect(apiRequest).toHaveBeenCalledWith("POST", "/api/ads/ad1/click");
    expect(openURL).toHaveBeenCalledWith("https://example.com");
  });

  it("mantiene lo schema esistente dell'URL", async () => {
    const { handlers } = makeHandlers();
    await handlers.handleAdClick({ id: "ad2", linkUrl: "http://foo.test/x" });
    expect(openURL).toHaveBeenCalledWith("http://foo.test/x");
  });

  it("senza linkUrl: registra il click ma non apre nulla", async () => {
    const { handlers } = makeHandlers();
    await handlers.handleAdClick({ id: "ad3" });
    expect(apiRequest).toHaveBeenCalledWith("POST", "/api/ads/ad3/click");
    expect(openURL).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════
// getAreaLabel
// ══════════════════════════════════════════════════════════════════════════
describe("getAreaLabel", () => {
  it("nessun paese selezionato → tutto il mondo", () => {
    expect(getAreaLabel([])).toBe("🌍 Tutto il mondo");
    expect(getAreaLabel(undefined as unknown as string[])).toBe("🌍 Tutto il mondo");
  });

  it("tutti i codici di un continente → etichetta del continente", () => {
    const na = CONTINENT_MAP.find((c) => c.key === "NA")!;
    expect(getAreaLabel([...na.countryCodes])).toBe(na.label);
  });

  it("singolo paese → bandiera + nome", () => {
    expect(getAreaLabel(["IT"])).toBe("🇮🇹 Italia");
  });

  it("più paesi (sottoinsieme di un continente) → conteggio N paesi", () => {
    expect(getAreaLabel(["IT", "FR"])).toBe("2 paesi");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// useHomeMapCalculated (valori derivati: chi mostrare / dove centrare)
// ══════════════════════════════════════════════════════════════════════════

// mapData minimale: solo le query lette da useHomeMapCalculated
function makeMapData(overrides: Record<string, unknown> = {}) {
  return {
    onlineCountQuery: { data: undefined },
    bikerCountQuery: { data: undefined },
    zavCountQuery: { data: undefined },
    myProposalsQuery: { data: undefined },
    ...overrides,
  };
}

type CalcArgs = {
  mapData?: ReturnType<typeof makeMapData>;
  nearbyUsers?: any[];
  user?: any;
  location?: any;
  filterBiker?: boolean;
  filterZavorrina?: boolean;
  profileQData?: any;
};

// monta il hook in un reconciler React reale e ne cattura il valore restituito
function calc(args: CalcArgs) {
  const {
    mapData = makeMapData(),
    nearbyUsers = [],
    user = null,
    location = null,
    filterBiker = true,
    filterZavorrina = true,
    profileQData = undefined,
  } = args;
  let result: ReturnType<typeof useHomeMapCalculated> | null = null;
  function Probe() {
    result = useHomeMapCalculated(
      mapData,
      nearbyUsers,
      user,
      location,
      filterBiker,
      filterZavorrina,
      profileQData,
    );
    return null;
  }
  let renderer: TestRenderer.ReactTestRenderer | null = null;
  act(() => {
    renderer = TestRenderer.create(React.createElement(Probe));
  });
  act(() => {
    renderer!.unmount();
  });
  return result!;
}

describe("useHomeMapCalculated → usersWithSelf", () => {
  it("inietta l'utente corrente in testa quando assente dalla lista", () => {
    const res = calc({
      nearbyUsers: [{ id: "u1" }],
      user: { id: "me", nickname: "Io", userType: "biker" },
      location: { latitude: 45, longitude: 9 },
    });
    expect(res.usersWithSelf).toHaveLength(2);
    expect(res.usersWithSelf[0].id).toBe("me");
    expect(res.usersWithSelf[0].latitude).toBe(45);
    expect(res.usersWithSelf[0].longitude).toBe(9);
    expect(res.usersWithSelf[1].id).toBe("u1");
  });

  it("NON duplica l'utente corrente quando è già presente nella lista", () => {
    const rawList = [{ id: "me" }, { id: "u1" }];
    const res = calc({
      nearbyUsers: rawList,
      user: { id: "me" },
      location: { latitude: 45, longitude: 9 },
    });
    expect(res.usersWithSelf).toHaveLength(2);
    expect(res.usersWithSelf.filter((u) => u.id === "me")).toHaveLength(1);
  });

  it("senza user o location restituisce la lista grezza inalterata", () => {
    const rawList = [{ id: "u1" }];
    expect(calc({ nearbyUsers: rawList, user: null, location: { latitude: 1, longitude: 2 } }).usersWithSelf).toBe(rawList);
    expect(calc({ nearbyUsers: rawList, user: { id: "me" }, location: null }).usersWithSelf).toBe(rawList);
  });
});

describe("useHomeMapCalculated → smallMapInitialCenter", () => {
  it("filtri attivi: media le coordinate degli utenti visibili", () => {
    const res = calc({
      filterBiker: false, // filtersActive = !filterBiker || !filterZavorrina
      filterZavorrina: true,
      nearbyUsers: [
        { id: "u1", userType: "coppia", latitude: 10, longitude: 20 },
        { id: "u2", userType: "coppia", latitude: 30, longitude: 40 },
      ],
    });
    expect(res.smallMapInitialCenter).toEqual({ latitude: 20, longitude: 30 });
  });

  it("filtri non attivi: fallback alle coordinate del profilo salvato", () => {
    const res = calc({
      filterBiker: true,
      filterZavorrina: true,
      nearbyUsers: [{ id: "u1", userType: "coppia", latitude: 10, longitude: 20 }],
      profileQData: { latitude: 5, longitude: 6 },
    });
    expect(res.smallMapInitialCenter).toEqual({ latitude: 5, longitude: 6 });
  });

  it("nessuna sorgente disponibile → null", () => {
    const res = calc({
      filterBiker: true,
      filterZavorrina: true,
      nearbyUsers: [],
      profileQData: undefined,
    });
    expect(res.smallMapInitialCenter).toBeNull();
  });
});

describe("useHomeMapCalculated → mySearchRadius", () => {
  it("nessuna proposta attiva → 0", () => {
    expect(calc({ user: { id: "me" } }).mySearchRadius).toBe(0);
    expect(
      calc({
        user: { id: "me" },
        mapData: makeMapData({ myProposalsQuery: { data: [] } }),
      }).mySearchRadius,
    ).toBe(0);
  });

  it("restituisce il max searchRadius tra le proprie proposte attive", () => {
    const res = calc({
      user: { id: "me" },
      mapData: makeMapData({
        myProposalsQuery: {
          data: [
            { userId: "me", status: "active", searchRadius: 50 },
            { userId: "me", status: "active", searchRadius: 120 },
            { userId: "other", status: "active", searchRadius: 999 },
            { userId: "me", status: "inactive", searchRadius: 500 },
          ],
        },
      }),
    });
    expect(res.mySearchRadius).toBe(120);
  });
});
