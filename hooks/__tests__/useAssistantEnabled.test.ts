/**
 * Regression guard per la logica default-safe di useAssistantEnabled.
 *
 * Bug storico (Task #4430): quando l'admin non aveva MAI salvato una config
 * (query senza dati / in caricamento), l'assistente compariva come
 * "Disabilitato dall'amministratore" e il pallino flottante + gli switch
 * restavano bloccati. Il contratto corretto è: l'assistente è abilitato a
 * meno che l'admin non lo abbia ESPLICITAMENTE disabilitato
 * (config.enabled === false). Tutto il resto (undefined, oggetto vuoto,
 * config mai salvata) deve risultare abilitato.
 *
 * Strategia (coerente con hooks/__tests__/useOtaAutoUpdate.test.ts):
 *   - `react` è mockato: useMemo esegue subito la factory (nessun mounting).
 *   - useAssistantConfig / useAssistantPrefs sono mockati e configurabili per
 *     test così da pilotare data / isLoading.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── mock: react (useMemo sincrono) ───────────────────────────────────────────
vi.mock("react", () => ({
  useMemo: (factory: () => unknown) => factory(),
}));

// ── mock: hook dipendenti, pilotabili per test ───────────────────────────────
const cfgQ = vi.hoisted(() => ({ value: { data: undefined, isLoading: false } as {
  data: unknown;
  isLoading: boolean;
} }));
const prefsQ = vi.hoisted(() => ({ value: { data: undefined, isLoading: false } as {
  data: unknown;
  isLoading: boolean;
} }));

vi.mock("../useAssistantConfig", () => ({
  useAssistantConfig: () => cfgQ.value,
}));
vi.mock("../useAssistantPrefs", () => ({
  useAssistantPrefs: () => prefsQ.value,
}));

import { useAssistantEnabled } from "../useAssistantEnabled";

beforeEach(() => {
  cfgQ.value = { data: undefined, isLoading: false };
  prefsQ.value = { data: undefined, isLoading: false };
});

// ══════════════════════════════════════════════════════════════════════════
// Default-safe: nessuna config → abilitato
// ══════════════════════════════════════════════════════════════════════════
describe("useAssistantEnabled — default-safe quando manca la config admin", () => {
  it("config undefined (mai caricata) → adminEnabled true, niente disabilitazione", () => {
    cfgQ.value = { data: undefined, isLoading: false };
    const s = useAssistantEnabled();
    expect(s.adminEnabled).toBe(true);
    expect(s.adminDisabledForPlatform).toBe(false);
    // i default modes hanno fab true → il pallino NON deve essere bloccato
    expect(s.fabEnabled).toBe(true);
  });

  it("config in caricamento → adminEnabled true (no flash 'disabilitato')", () => {
    cfgQ.value = { data: undefined, isLoading: true };
    const s = useAssistantEnabled();
    expect(s.loading).toBe(true);
    expect(s.adminEnabled).toBe(true);
    expect(s.adminDisabledForPlatform).toBe(false);
    expect(s.fabEnabled).toBe(true);
  });

  it("config presente ma senza campo enabled → trattata come abilitata", () => {
    cfgQ.value = { data: { config: {} }, isLoading: false };
    const s = useAssistantEnabled();
    expect(s.adminEnabled).toBe(true);
    expect(s.fabEnabled).toBe(true);
  });

  it("enabled: true esplicito → abilitato", () => {
    cfgQ.value = { data: { config: { enabled: true } }, isLoading: false };
    const s = useAssistantEnabled();
    expect(s.adminEnabled).toBe(true);
    expect(s.adminDisabledForPlatform).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Solo enabled === false disabilita
// ══════════════════════════════════════════════════════════════════════════
describe("useAssistantEnabled — solo enabled === false disabilita", () => {
  it("enabled: false → adminEnabled false e tutto bloccato", () => {
    cfgQ.value = { data: { config: { enabled: false } }, isLoading: false };
    const s = useAssistantEnabled();
    expect(s.adminEnabled).toBe(false);
    expect(s.adminDisabledForPlatform).toBe(true);
    expect(s.fabEnabled).toBe(false);
    expect(s.selectiveEnabled).toBe(false);
    expect(s.onboardingEnabled).toBe(false);
    expect(s.proactiveEnabled).toBe(false);
  });

  it("enabled: false NON è scavalcato dai modes attivi", () => {
    cfgQ.value = {
      data: { config: { enabled: false, modes: { fab: true, selective: true, onboarding: true } } },
      isLoading: false,
    };
    const s = useAssistantEnabled();
    expect(s.fabEnabled).toBe(false);
    expect(s.selectiveEnabled).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Modes e preferenze utente sopra una config admin abilitata
// ══════════════════════════════════════════════════════════════════════════
describe("useAssistantEnabled — modes admin + prefs utente", () => {
  it("rispetta i modes espliciti dell'admin", () => {
    cfgQ.value = {
      data: { config: { enabled: true, modes: { fab: false, selective: true, onboarding: false } } },
      isLoading: false,
    };
    const s = useAssistantEnabled();
    expect(s.fabEnabled).toBe(false);
    expect(s.selectiveEnabled).toBe(true);
    expect(s.onboardingEnabled).toBe(false);
  });

  it("userDisabled spegne tutto pur con admin abilitato", () => {
    cfgQ.value = { data: { config: { enabled: true, modes: { fab: true } } }, isLoading: false };
    prefsQ.value = { data: { prefs: { disabled: true } }, isLoading: false };
    const s = useAssistantEnabled();
    expect(s.adminEnabled).toBe(true);
    expect(s.userDisabled).toBe(true);
    expect(s.fabEnabled).toBe(false);
    expect(s.proactiveEnabled).toBe(false);
  });

  it("opt-out granulari: onboardingDisabled e proactiveDisabled", () => {
    cfgQ.value = {
      data: { config: { enabled: true, modes: { fab: true, selective: false, onboarding: true } } },
      isLoading: false,
    };
    prefsQ.value = { data: { prefs: { onboardingDisabled: true, proactiveDisabled: true } }, isLoading: false };
    const s = useAssistantEnabled();
    expect(s.onboardingEnabled).toBe(false);
    expect(s.proactiveEnabled).toBe(false);
    // il fab resta attivo: gli opt-out granulari non lo toccano
    expect(s.fabEnabled).toBe(true);
  });

  it("espone le proactiveRules dalla config admin", () => {
    cfgQ.value = {
      data: { config: { enabled: true, proactive: { "first-map-access": true, "long-ride-no-pause": false } } },
      isLoading: false,
    };
    const s = useAssistantEnabled();
    expect(s.proactiveRules).toEqual({ "first-map-access": true, "long-ride-no-pause": false });
  });
});
