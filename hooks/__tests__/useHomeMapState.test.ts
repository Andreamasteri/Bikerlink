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
 * Strategia: `useHomeMapHandlers` e `getAreaLabel` sono funzioni pure (nessun
 * hook React al loro interno), quindi si invocano direttamente. Mockiamo solo
 * le dipendenze di modulo che non caricano in ambiente node (react-native,
 * expo-router, context, hook mappa, query-client, AsyncStorage). NON mockiamo
 * `@/lib/countries-regions`: getAreaLabel viene testato contro i dati reali.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

import { useHomeMapHandlers, getAreaLabel } from "../home/useHomeMapState";
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
