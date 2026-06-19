/**
 * Regression guard per la forma dei dati del pannello admin AI Assistant.
 *
 * Componente sotto test: app/admin/ai-assistant.tsx
 *
 * Bug storico (Task #4430): l'endpoint admin restituisce UNA piattaforma per
 * volta ({ platform, config }), ma la UI ragiona su entrambe (tab Android/iOS).
 * Se le due risposte non venivano combinate correttamente in { android, ios },
 * `cur` diventava undefined → spinner infinito (schermata bianca). Inoltre il
 * PUT deve inviare la config di piattaforma come body DIRETTO, non wrappato in
 * { config }, altrimenti il server salva una struttura errata.
 *
 * Strategia (coerente con components/__tests__/*): import DIRETTO delle funzioni
 * pure di produzione (zero duplicazione di logica). Le dipendenze native /
 * react-query / expo sono mockate solo per consentire il caricamento del modulo;
 * il corpo del componente non viene mai eseguito.
 */

import { describe, it, expect, vi } from "vitest";

// ── mock: dipendenze necessarie solo per caricare il modulo ──────────────────
vi.mock("react", () => ({
  default: { createElement: vi.fn() },
  useState: (v: unknown) => [v, vi.fn()],
  useEffect: vi.fn(),
}));
vi.mock("react-native", () => ({
  View: {},
  Text: {},
  StyleSheet: { create: (s: unknown) => s },
  ScrollView: {},
  Switch: {},
  Pressable: {},
  ActivityIndicator: {},
  Alert: { alert: vi.fn() },
}));
vi.mock("expo-router", () => ({ Stack: { Screen: {} } }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined, isLoading: false }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: {} }));
vi.mock("@/constants/colors", () => ({ default: {} }));
vi.mock("@/lib/query-client", () => ({ apiRequest: vi.fn() }));

// ── import DIRETTO delle funzioni pure di produzione ─────────────────────────
import { combineAssistantAdminConfig, buildAssistantSaveRequests } from "@/app/admin/ai-assistant";

// ── helper per costruire una config di piattaforma riconoscibile ─────────────
function makePlatformConfig(tag: string) {
  return {
    enabled: true,
    modes: { fab: true, selective: false, onboarding: true },
    actions: { [`act-${tag}`]: true },
    proactive: { [`rule-${tag}`]: true },
    customFaqKeys: [`faq-${tag}`],
  };
}

// ══════════════════════════════════════════════════════════════════════════
// combineAssistantAdminConfig — fonde le due GET per-piattaforma
// ══════════════════════════════════════════════════════════════════════════
describe("combineAssistantAdminConfig — fonde { platform, config } in { android, ios }", () => {
  it("mappa ogni config sulla piattaforma corretta", () => {
    const androidCfg = makePlatformConfig("android");
    const iosCfg = makePlatformConfig("ios");

    const out = combineAssistantAdminConfig(
      { config: androidCfg },
      { config: iosCfg },
    );

    expect(out).toEqual({ config: { android: androidCfg, ios: iosCfg } });
    // identità preservata (nessuna copia/perdita di riferimento)
    expect(out.config.android).toBe(androidCfg);
    expect(out.config.ios).toBe(iosCfg);
  });

  it("il risultato espone entrambe le piattaforme → `cur` non sarà mai undefined", () => {
    const out = combineAssistantAdminConfig(
      { config: makePlatformConfig("a") },
      { config: makePlatformConfig("b") },
    );
    expect(out.config.android).toBeDefined();
    expect(out.config.ios).toBeDefined();
  });

  it("non scambia le piattaforme (android ≠ ios)", () => {
    const androidCfg = makePlatformConfig("android");
    const iosCfg = makePlatformConfig("ios");
    const out = combineAssistantAdminConfig({ config: androidCfg }, { config: iosCfg });
    expect(out.config.android).not.toBe(iosCfg);
    expect(out.config.ios).not.toBe(androidCfg);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// buildAssistantSaveRequests — body PUT diretto, non wrappato in { config }
// ══════════════════════════════════════════════════════════════════════════
describe("buildAssistantSaveRequests — PUT con body di piattaforma diretto", () => {
  it("emette una richiesta per piattaforma con il body grezzo", () => {
    const androidCfg = makePlatformConfig("android");
    const iosCfg = makePlatformConfig("ios");

    const reqs = buildAssistantSaveRequests({ android: androidCfg, ios: iosCfg });

    expect(reqs).toHaveLength(2);
    expect(reqs[0]).toEqual({ platform: "android", body: androidCfg });
    expect(reqs[1]).toEqual({ platform: "ios", body: iosCfg });
  });

  it("il body è la config di piattaforma, NON { config }", () => {
    const androidCfg = makePlatformConfig("android");
    const reqs = buildAssistantSaveRequests({ android: androidCfg, ios: makePlatformConfig("ios") });

    // identità diretta col config di piattaforma
    expect(reqs[0].body).toBe(androidCfg);
    // guard esplicito anti-regressione: niente wrapping in { config }
    const body = reqs[0].body as unknown as Record<string, unknown>;
    expect(body.config).toBeUndefined();
    expect(body.enabled).toBe(true);
  });

  it("copre sia android che ios", () => {
    const reqs = buildAssistantSaveRequests({
      android: makePlatformConfig("a"),
      ios: makePlatformConfig("b"),
    });
    expect(reqs.map((r) => r.platform)).toEqual(["android", "ios"]);
  });
});
