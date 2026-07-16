// Test unitari per scripts/health-check/checkers/logic.ts
// Verifica che ogni pattern (LG-*) emetta checkId/category/severity corretti
// e che i pathHint filtrino i file correttamente.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SourceFile } from "../scan-utils";

const { mockListSourceFiles, mockSafeRead } = vi.hoisted(() => ({
  mockListSourceFiles: vi.fn<() => SourceFile[]>(),
  mockSafeRead: vi.fn<(s: string) => string>(),
}));

vi.mock("../scan-utils", () => ({
  ROOT: "/fake-root",
  listSourceFiles: mockListSourceFiles,
  safeRead: mockSafeRead,
  offsetToLine: (_text: string, _offset: number): number => 1,
  lineSnippet: (_text: string, _line: number): string => "snippet",
}));

import { runLogic } from "../checkers/logic";

function makeFile(rel: string): SourceFile {
  return { rel, abs: `/fake-root/${rel}`, ext: rel.endsWith(".tsx") ? ".tsx" : ".ts" };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runLogic — nessun problema", () => {
  it("lista file vuota → risultato vuoto", async () => {
    mockListSourceFiles.mockReturnValue([]);
    const results = await runLogic();
    expect(results).toHaveLength(0);
  });

  it("file pulito senza anti-pattern → risultato vuoto", async () => {
    mockListSourceFiles.mockReturnValue([makeFile("app/screen.tsx")]);
    mockSafeRead.mockReturnValue(`
export default function Screen() {
  return null;
}
    `);
    const results = await runLogic();
    expect(results).toHaveLength(0);
  });

  it("safeRead vuoto → risultato vuoto", async () => {
    mockListSourceFiles.mockReturnValue([makeFile("app/empty.tsx")]);
    mockSafeRead.mockReturnValue("");
    const results = await runLogic();
    expect(results).toHaveLength(0);
  });
});

describe("runLogic — LG-router-deps", () => {
  it("router nelle deps di useEffect → LG-router-deps warning logic", async () => {
    mockListSourceFiles.mockReturnValue([makeFile("app/screen.tsx")]);
    // Il regex usa [^)]* quindi l'arrow function non può avere () nel body; uso cb =>
    mockSafeRead.mockReturnValue(`useEffect(cb => {}, [router]);`);

    const results = await runLogic();
    const hit = results.find((r) => r.checkId === "LG-router-deps");
    expect(hit).toBeDefined();
    expect(hit!.category).toBe("logic");
    expect(hit!.severity).toBe("warning");
  });

  it("useEffect con deps array senza router → nessun LG-router-deps", async () => {
    mockListSourceFiles.mockReturnValue([makeFile("app/screen.tsx")]);
    mockSafeRead.mockReturnValue(`
useEffect(() => { doSomething(); }, [value]);
    `);

    const results = await runLogic();
    expect(results.find((r) => r.checkId === "LG-router-deps")).toBeUndefined();
  });
});

describe("runLogic — LG-inline-taboptions (pathHint: _layout.tsx)", () => {
  it("tabBarIcon inline in _layout.tsx → LG-inline-taboptions warning", async () => {
    mockListSourceFiles.mockReturnValue([makeFile("app/(tabs)/_layout.tsx")]);
    // Il regex cerca tabBarIcon\s*=\s*\{\s*\( ovvero la sintassi JSX prop: tabBarIcon={(...
    mockSafeRead.mockReturnValue(`<Tab.Screen tabBarIcon={({ color }) => null} />`);

    const results = await runLogic();
    const hit = results.find((r) => r.checkId === "LG-inline-taboptions");
    expect(hit).toBeDefined();
    expect(hit!.category).toBe("logic");
    expect(hit!.severity).toBe("warning");
  });

  it("tabBarIcon inline in file NON _layout → non segnalato (pathHint)", async () => {
    mockListSourceFiles.mockReturnValue([makeFile("app/home.tsx")]);
    mockSafeRead.mockReturnValue(`tabBarIcon = {(`);

    const results = await runLogic();
    expect(results.find((r) => r.checkId === "LG-inline-taboptions")).toBeUndefined();
  });
});

describe("runLogic — LG-nested-screenoptions", () => {
  it("screenOptions con oggetto annidato → LG-nested-screenoptions warning", async () => {
    mockListSourceFiles.mockReturnValue([makeFile("app/(tabs)/_layout.tsx")]);
    mockSafeRead.mockReturnValue(`
<Stack screenOptions={{
  headerStyle: {
    backgroundColor: "red",
  },
}} />
    `);

    const results = await runLogic();
    const hit = results.find((r) => r.checkId === "LG-nested-screenoptions");
    expect(hit).toBeDefined();
    expect(hit!.category).toBe("logic");
    expect(hit!.severity).toBe("warning");
  });

  it("screenOptions senza oggetti annidati → nessun LG-nested-screenoptions", async () => {
    mockListSourceFiles.mockReturnValue([makeFile("app/_layout.tsx")]);
    mockSafeRead.mockReturnValue(`<Stack screenOptions={{ title: "Home" }} />`);

    const results = await runLogic();
    expect(results.find((r) => r.checkId === "LG-nested-screenoptions")).toBeUndefined();
  });
});

describe("runLogic — LG-usestate-no-type", () => {
  it("useState([]) senza tipo → LG-usestate-no-type info", async () => {
    mockListSourceFiles.mockReturnValue([makeFile("app/screen.tsx")]);
    mockSafeRead.mockReturnValue(`const [items, setItems] = useState([]);`);

    const results = await runLogic();
    const hit = results.find((r) => r.checkId === "LG-usestate-no-type");
    expect(hit).toBeDefined();
    expect(hit!.category).toBe("logic");
    expect(hit!.severity).toBe("info");
  });

  it("useState<Item[]>([]) con tipo → nessun LG-usestate-no-type", async () => {
    mockListSourceFiles.mockReturnValue([makeFile("app/screen.tsx")]);
    mockSafeRead.mockReturnValue(`const [items, setItems] = useState<Item[]>([]);`);

    const results = await runLogic();
    expect(results.find((r) => r.checkId === "LG-usestate-no-type")).toBeUndefined();
  });
});

describe("runLogic — LG-console-log (pathHint: app/)", () => {
  it("console.log in app/ → LG-console-log info", async () => {
    mockListSourceFiles.mockReturnValue([makeFile("app/debug.tsx")]);
    mockSafeRead.mockReturnValue(`
  console.log("debug value", value);
    `);

    const results = await runLogic();
    const hit = results.find((r) => r.checkId === "LG-console-log");
    expect(hit).toBeDefined();
    expect(hit!.category).toBe("logic");
    expect(hit!.severity).toBe("info");
  });

  it("console.log in server/ → non segnalato (pathHint app/ only)", async () => {
    mockListSourceFiles.mockReturnValue([makeFile("server/routes.ts")]);
    mockSafeRead.mockReturnValue(`  console.log("server log");`);

    const results = await runLogic();
    expect(results.find((r) => r.checkId === "LG-console-log")).toBeUndefined();
  });

  it("console.log in components/ → non segnalato (pathHint app/ only)", async () => {
    mockListSourceFiles.mockReturnValue([makeFile("components/Widget.tsx")]);
    mockSafeRead.mockReturnValue(`  console.log("widget debug");`);

    const results = await runLogic();
    expect(results.find((r) => r.checkId === "LG-console-log")).toBeUndefined();
  });
});

describe("runLogic — LG-promise-all-db (pathHint: server/)", () => {
  it("Promise.all in server/ → LG-promise-all-db info", async () => {
    mockListSourceFiles.mockReturnValue([makeFile("server/jobs/collector.ts")]);
    mockSafeRead.mockReturnValue(`
const results = await Promise.all([queryA(), queryB()]);
    `);

    const results = await runLogic();
    const hit = results.find((r) => r.checkId === "LG-promise-all-db");
    expect(hit).toBeDefined();
    expect(hit!.category).toBe("logic");
    expect(hit!.severity).toBe("info");
  });

  it("Promise.all in app/ → non segnalato (pathHint server/ only)", async () => {
    mockListSourceFiles.mockReturnValue([makeFile("app/screen.tsx")]);
    mockSafeRead.mockReturnValue(`await Promise.all([a(), b()]);`);

    const results = await runLogic();
    expect(results.find((r) => r.checkId === "LG-promise-all-db")).toBeUndefined();
  });
});

describe("runLogic — campi obbligatori presenti su ogni risultato", () => {
  it("ogni risultato ha checkId, category e severity definiti", async () => {
    mockListSourceFiles.mockReturnValue([makeFile("app/debug.tsx")]);
    mockSafeRead.mockReturnValue(`
  console.log("x");
  const [items] = useState([]);
    `);

    const results = await runLogic();
    for (const r of results) {
      expect(r.checkId).toBeTruthy();
      expect(r.category).toBe("logic");
      expect(["critical", "warning", "info"]).toContain(r.severity);
    }
  });
});
