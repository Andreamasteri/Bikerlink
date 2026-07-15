/**
 * Task #39 — mount-level end-to-end verification for app/admin/ai-monitor.tsx.
 *
 * Stessa strategia di CoordinatorJobsScreen.render.test.ts (vedi commento
 * lì per il perché non è raggiungibile un vero test browser/device qui):
 * monta il componente reale con react-test-renderer dentro un vero
 * QueryClientProvider, mockando solo `apiRequest` con risposte a shape
 * identica a server/routes/admin/ai-monitor.ts. Copre:
 *  - il render della griglia a 4 agenti con dati "live" (online/offline/latenza);
 *  - il tap su una card che espande lo storico transizioni (nuova query GET
 *    /ai-monitor/history?persona=...) e ne rende le entry.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  ScrollView: "ScrollView",
  TouchableOpacity: "TouchableOpacity",
  StyleSheet: { create: (s: Record<string, unknown>) => s },
}));

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock("@expo/vector-icons", () => ({
  MaterialCommunityIcons: "MaterialCommunityIcons",
}));

const apiRequestMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/query-client", () => ({ apiRequest: apiRequestMock }));

import AiMonitorScreen from "@/app/admin/ai-monitor";

// Necessario in Node/React 19 perché react-test-renderer non lo imposta da solo:
// senza questo flag React scarta gli aggiornamenti di stato asincroni (query)
// programmati fuori da un act() sincrono, e lo screen resta bloccato sui dati iniziali.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ── Fixture: stessa shape della risposta reale di GET /api/admin/ai-monitor
function liveMonitorResponse() {
  return {
    checkedAt: new Date().toISOString(),
    agents: [
      { persona: "bowie", configured: true, online: true, latencyMs: 42, activeJobs: null },
      { persona: "horus", configured: true, online: true, latencyMs: 58, activeJobs: null },
      { persona: "ares", configured: true, online: false, latencyMs: null, activeJobs: null, error: "timeout" },
      { persona: "quebracho", configured: true, online: true, latencyMs: 12, activeJobs: 1 },
    ],
  };
}

function historyResponse() {
  return {
    entries: [
      { id: "h1", serviceKey: "ai:horus", transitionFrom: "offline", transitionTo: "online", occurredAt: new Date().toISOString() },
      { id: "h2", serviceKey: "ai:horus", transitionFrom: "online", transitionTo: "offline", occurredAt: new Date(Date.now() - 3_600_000).toISOString() },
    ],
  };
}

function jsonResponse(body: unknown) {
  return { json: async () => body };
}

function mockApiRequestRouter() {
  apiRequestMock.mockImplementation(async (method: string, url: string) => {
    if (method === "GET" && url === "/api/admin/ai-monitor") {
      return jsonResponse(liveMonitorResponse());
    }
    if (method === "GET" && url.startsWith("/api/admin/ai-monitor/history")) {
      return jsonResponse(historyResponse());
    }
    throw new Error(`apiRequest non gestito nel test: ${method} ${url}`);
  });
}

function buildClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
}

let renderer: TestRenderer.ReactTestRenderer | null = null;

async function flushPromises(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
  }
}

async function mount(client: QueryClient) {
  await act(async () => {
    renderer = TestRenderer.create(
      React.createElement(QueryClientProvider, { client }, React.createElement(AiMonitorScreen)),
    );
  });
  await flushPromises();
}

function findByTestId(testID: string) {
  return renderer!.root.findAll((n) => n.props.testID === testID);
}

// I <Text> con interpolazioni JSX producono un array di children in
// react-test-renderer, non una singola stringa: appiattiamo per assert semplici.
function textOf(node: { props: { children?: unknown } }): string {
  const c = node.props.children;
  if (Array.isArray(c)) return c.map((x) => String(x)).join("");
  return String(c ?? "");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApiRequestRouter();
  renderer = null;
});

afterEach(async () => {
  if (renderer) {
    await act(async () => {
      renderer!.unmount();
    });
  }
});

describe("AiMonitorScreen — render end-to-end con dati live", () => {
  it("fa il fetch e rende le 4 card agente con stato online/offline reale", async () => {
    const client = buildClient();
    await mount(client);

    expect(apiRequestMock).toHaveBeenCalledWith("GET", "/api/admin/ai-monitor");
    for (const persona of ["bowie", "horus", "ares", "quebracho"]) {
      expect(findByTestId(`ai-monitor-card-${persona}`)).toHaveLength(1);
    }

    const aresCard = findByTestId("ai-monitor-card-ares")[0];
    const offlineText = aresCard.findAll((n) => (n.type as unknown) === "Text" && textOf(n).startsWith("Offline"));
    expect(offlineText).toHaveLength(1);

    const quebrachoCard = findByTestId("ai-monitor-card-quebracho")[0];
    const jobsText = quebrachoCard.findAll((n) => (n.type as unknown) === "Text" && textOf(n) === "1 job attivi");
    expect(jobsText).toHaveLength(1);
  });

  it("tap sulla card Horus espande lo storico transizioni e ne rende le entry", async () => {
    const client = buildClient();
    await mount(client);

    const horusCard = findByTestId("ai-monitor-card-horus")[0];
    await act(async () => {
      horusCard.props.onPress();
    });
    await flushPromises();

    expect(apiRequestMock).toHaveBeenCalledWith("GET", "/api/admin/ai-monitor/history?persona=horus&limit=30");

    const historyRows = renderer!.root.findAll((n) => (n.type as unknown) === "Text" && textOf(n).includes("→"));
    expect(historyRows.length).toBe(2);
    expect(textOf(historyRows[0])).toBe("offline → online");
    expect(textOf(historyRows[1])).toBe("online → offline");
  });

  it("un secondo tap sulla stessa card la richiude (nessun history section)", async () => {
    const client = buildClient();
    await mount(client);

    const horusCard = findByTestId("ai-monitor-card-horus")[0];
    await act(async () => {
      horusCard.props.onPress();
    });
    await flushPromises();
    await act(async () => {
      horusCard.props.onPress();
    });
    await flushPromises();

    const historyRows = renderer!.root.findAll((n) => (n.type as unknown) === "Text" && textOf(n).includes("→"));
    expect(historyRows).toHaveLength(0);
  });
});
