/**
 * Test per lo stato vuoto di ProposalsCard (Task #890).
 *
 * Quando `pendingProposals` è vuoto ma ci sono problemi HIGH/CRITICAL attivi,
 * il componente deve mostrare un placeholder con un pulsante CTA "Genera proposte
 * ora" invece di scomparire. Se invece non ci sono problemi HIGH attivi, mostra
 * il messaggio generico "Nessuna proposta AI pendente".
 *
 * Strategia: react-test-renderer puro (no Expo web / no Playwright), con
 * react-native interamente mockato come stringhe primitive per evitare il
 * parsing Flow — stesso pattern usato dagli altri test di mount nel progetto.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as React from "react";
import renderer from "react-test-renderer";
import { act } from "react";

// ── Mock: react-native — tutti i componenti usati da ProposalsCard ──────────
vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  TouchableOpacity: "TouchableOpacity",
  ActivityIndicator: "ActivityIndicator",
  StyleSheet: {
    create: (s: unknown) => s,
  },
}));

import { ProposalsCard, type WatchdogLog } from "../admin/system-health/ProposalsCard";

// ── Helper ─────────────────────────────────────────────────────────────────

function toJSON(element: React.ReactElement) {
  let tree!: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(element); });
  return JSON.stringify(tree.toJSON());
}

const noop = () => {};

const PENDING_PROPOSAL: WatchdogLog = {
  id: "prop-1",
  kind: "proposal",
  status: "pending",
  summary: "Proposta di test",
  createdAt: new Date().toISOString(),
};

// ── Test suite ─────────────────────────────────────────────────────────────

describe("ProposalsCard — stato vuoto (Task #890)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mostra il messaggio generico quando non ci sono né proposte né problemi HIGH", () => {
    const json = toJSON(
      React.createElement(ProposalsCard, {
        proposals: [],
        onAccept: noop,
        onReject: noop,
        activeHighProblems: 0,
        onProposeNow: noop,
      }),
    );
    expect(json).toContain("Nessuna proposta AI pendente");
    expect(json).not.toContain("Genera proposte ora");
  });

  it("mostra il CTA 'Genera proposte ora' quando non ci sono proposte ma ci sono problemi HIGH", () => {
    const json = toJSON(
      React.createElement(ProposalsCard, {
        proposals: [],
        onAccept: noop,
        onReject: noop,
        activeHighProblems: 2,
        onProposeNow: noop,
      }),
    );
    expect(json).toContain("Genera proposte ora");
    expect(json).not.toContain("Nessuna proposta AI pendente");
  });

  it("mostra il contatore problemi HIGH nel placeholder", () => {
    const json = toJSON(
      React.createElement(ProposalsCard, {
        proposals: [],
        onAccept: noop,
        onReject: noop,
        activeHighProblems: 3,
        onProposeNow: noop,
      }),
    );
    expect(json).toContain("3");
    expect(json).toContain("Genera proposte ora");
  });

  it("non mostra il CTA se onProposeNow non è passato (retrocompatibilità)", () => {
    // Senza onProposeNow, anche con problemi HIGH deve ricadere sul testo generico.
    const json = toJSON(
      React.createElement(ProposalsCard, {
        proposals: [],
        onAccept: noop,
        onReject: noop,
        activeHighProblems: 5,
        // onProposeNow non passato
      }),
    );
    expect(json).toContain("Nessuna proposta AI pendente");
    expect(json).not.toContain("Genera proposte ora");
  });

  it("mostra il testo 'Generazione…' quando proposingNow=true", () => {
    const json = toJSON(
      React.createElement(ProposalsCard, {
        proposals: [],
        onAccept: noop,
        onReject: noop,
        activeHighProblems: 1,
        onProposeNow: noop,
        proposingNow: true,
      }),
    );
    expect(json).toContain("Generazione");
    expect(json).not.toContain("Genera proposte ora");
  });

  it("quando ci sono proposte pendenti, mostra le proposte e non il placeholder", () => {
    const json = toJSON(
      React.createElement(ProposalsCard, {
        proposals: [PENDING_PROPOSAL],
        onAccept: noop,
        onReject: noop,
        activeHighProblems: 2,
        onProposeNow: noop,
      }),
    );
    // La proposta deve essere visibile.
    expect(json).toContain("Proposta di test");
    // Il placeholder non deve comparire.
    expect(json).not.toContain("Genera proposte ora");
    expect(json).not.toContain("Nessuna proposta AI pendente");
  });
});
