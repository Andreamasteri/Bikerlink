/**
 * Task #39 — mount-level end-to-end verification for app/admin/coordinator-jobs.tsx.
 *
 * Il web preview di Expo è disabilitato di proposito (vedi metro.config.js:
 * "/* BikerLink web preview disabled *\/"), e non è disponibile un
 * device/emulatore reale in questo ambiente sandboxed: non è possibile
 * pilotare la schermata via Playwright/browser come farebbe un utente reale.
 * Questo test è l'equivalente più fedele raggiungibile qui: monta il
 * COMPONENTE REALE (non solo il router Express) con react-test-renderer,
 * dentro un vero QueryClientProvider, mockando solo `apiRequest` per
 * restituire risposte con la stessa shape del backend reale
 * (server/routes/admin/coordinator-jobs.ts). Copre:
 *  - il fetch iniziale e il render della lista job con dati "live";
 *  - il click su "Pausa" che invia la direttiva admin_manual e rifà il fetch;
 *  - il toggle del kill-switch (con conferma Alert) che POSTa e rifà il fetch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("react-native", () => {
  const alert = vi.fn();
  return {
    View: "View",
    Text: "Text",
    ScrollView: "ScrollView",
    TouchableOpacity: "TouchableOpacity",
    StyleSheet: { create: (s: Record<string, unknown>) => s },
    Alert: { alert },
  };
});

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock("@expo/vector-icons", () => ({
  MaterialCommunityIcons: "MaterialCommunityIcons",
}));

const apiRequestMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/query-client", () => ({ apiRequest: apiRequestMock }));

import CoordinatorJobsScreen from "@/app/admin/coordinator-jobs";
import { Alert } from "react-native";

// Necessario in Node/React 19 perché react-test-renderer non lo imposta da solo:
// senza questo flag React scarta gli aggiornamenti di stato asincroni (query/mutation)
// programmati fuori da un act() sincrono, e lo screen resta bloccato sui dati iniziali.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ── Fixture: stessa shape della risposta reale di GET /api/admin/coordinator/jobs
const liveJobsResponse = () => ({
  killSwitch: false,
  quebrachoReachable: true,
  summary: { killSwitch: false, quebrachoReachable: true, jobs: { total: 2, running: 1, paused: 0, throttled: 0 } },
  jobs: [
    {
      name: "routing-health-probe",
      state: "running",
      lastRunAt: Date.now() - 60_000,
      lastSuccessAt: Date.now() - 60_000,
      lastErrorAt: null,
      nextRunAt: Date.now() + 60_000,
      pauseSource: null,
      pauseReason: null,
      runCount: 42,
      successCount: 40,
      failureCount: 2,
      directive: null,
    },
    {
      name: "vacuum-smart",
      state: "idle",
      lastRunAt: Date.now() - 3_600_000,
      lastSuccessAt: Date.now() - 3_600_000,
      lastErrorAt: null,
      nextRunAt: null,
      pauseSource: null,
      pauseReason: null,
      runCount: 5,
      successCount: 5,
      failureCount: 0,
      directive: null,
    },
  ],
});

function jsonResponse(body: unknown) {
  return { json: async () => body };
}

function mockApiRequestRouter() {
  apiRequestMock.mockImplementation(async (method: string, url: string, body?: unknown) => {
    if (method === "GET" && url === "/api/admin/coordinator/jobs") {
      return jsonResponse(liveJobsResponse());
    }
    if (method === "POST" && url.includes("/directive")) {
      const name = decodeURIComponent(url.split("/jobs/")[1].split("/directive")[0]);
      const kind = (body as { kind: string }).kind;
      return jsonResponse({ applied: true, jobName: name, kind });
    }
    if (method === "POST" && url === "/api/admin/coordinator/kill-switch") {
      return jsonResponse({ active: (body as { active: boolean }).active });
    }
    throw new Error(`apiRequest non gestito nel test: ${method} ${url}`);
  });
}

function buildClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
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
      React.createElement(QueryClientProvider, { client }, React.createElement(CoordinatorJobsScreen)),
    );
  });
  await flushPromises();
}

function findByTestId(testID: string) {
  return renderer!.root.findAll((n) => n.props.testID === testID);
}

// I <Text> con interpolazioni JSX (es. `Quebracho {x}`) producono un array di
// children in react-test-renderer, non una singola stringa: appiattiamo per
// poter fare assert testuali semplici.
function textOf(node: { props: { children?: unknown } }): string {
  const c = node.props.children;
  if (Array.isArray(c)) return c.map((x) => String(x)).join("");
  return String(c ?? "");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApiRequestRouter();
  (Alert.alert as ReturnType<typeof vi.fn>).mockReset();
  renderer = null;
});

afterEach(async () => {
  if (renderer) {
    await act(async () => {
      renderer!.unmount();
    });
  }
});

describe("CoordinatorJobsScreen — render end-to-end con dati live", () => {
  it("fa il fetch iniziale e rende la lista job con stato/counters reali", async () => {
    const client = buildClient();
    await mount(client);

    expect(apiRequestMock).toHaveBeenCalledWith("GET", "/api/admin/coordinator/jobs");
    expect(findByTestId("coordinator-job-routing-health-probe")).toHaveLength(1);
    expect(findByTestId("coordinator-job-vacuum-smart")).toHaveLength(1);

    const sectionTitle = renderer!.root.findAll(
      (n) => (n.type as unknown) === "Text" && textOf(n) === "Job registrati (2)",
    );
    expect(sectionTitle).toHaveLength(1);
  });

  it("banner Quebracho raggiungibile quando quebrachoReachable=true", async () => {
    const client = buildClient();
    await mount(client);
    const banner = renderer!.root.findAll((n) => (n.type as unknown) === "Text" && textOf(n).includes("raggiungibile"));
    expect(banner.length).toBeGreaterThan(0);
    expect(textOf(banner[0])).not.toContain("non raggiungibile");
  });

  it("click su 'Pausa' invia la direttiva admin_manual e rifà il fetch della lista", async () => {
    const client = buildClient();
    await mount(client);

    const jobCard = findByTestId("coordinator-job-routing-health-probe")[0];
    const pausaBtn = jobCard.findAll(
      (n) => (n.type as unknown) === "Text" && n.props.children === "Pausa",
    )[0];
    let cur = pausaBtn.parent;
    while (cur && (cur.type as unknown) !== "TouchableOpacity") cur = cur.parent;

    apiRequestMock.mockClear();
    mockApiRequestRouter();

    await act(async () => {
      cur!.props.onPress();
    });
    await flushPromises();

    expect(apiRequestMock).toHaveBeenCalledWith(
      "POST",
      "/api/admin/coordinator/jobs/routing-health-probe/directive",
      { kind: "pause" },
    );
    // Round-trip: il mutation.onSettled invalida la query -> nuovo GET.
    expect(apiRequestMock).toHaveBeenCalledWith("GET", "/api/admin/coordinator/jobs");
  });

  it("toggle kill-switch: conferma via Alert e POSTa active=true", async () => {
    const client = buildClient();
    await mount(client);

    const toggle = findByTestId("coordinator-kill-switch-toggle")[0];
    await act(async () => {
      toggle.props.onPress();
    });

    expect(Alert.alert).toHaveBeenCalled();
    const [, , buttons] = (Alert.alert as ReturnType<typeof vi.fn>).mock.calls[0];
    const confirmBtn = (buttons as Array<{ text: string; onPress?: () => void }>).find((b) => b.onPress);
    expect(confirmBtn).toBeTruthy();

    apiRequestMock.mockClear();
    mockApiRequestRouter();

    await act(async () => {
      confirmBtn!.onPress!();
    });
    await flushPromises();

    expect(apiRequestMock).toHaveBeenCalledWith("POST", "/api/admin/coordinator/kill-switch", { active: true });
  });
});
