// Task #4920 — Regressione della classificazione 🟢 safe-fix / 🔴 review.
// La distinzione è deterministica e guida il pulsante "Crea tutti i task sicuri":
// un errore qui creerebbe task automatici per fix rischiosi. Questi test bloccano
// una regressione della logica in scripts/health-check/classify.ts.
import { describe, it, expect } from "vitest";
import { classifySafety, annotateSafety } from "../classify";
import type { CheckResult, Severity } from "../types";

function make(partial: Partial<CheckResult> & { category: string }): CheckResult {
  return {
    checkId: partial.checkId ?? "XX-001",
    category: partial.category,
    severity: partial.severity ?? "warning",
    description: partial.description ?? "descrizione generica",
    file: partial.file,
    line: partial.line,
    column: partial.column,
    evidence: partial.evidence,
    safeFix: partial.safeFix,
    aiDiff: partial.aiDiff,
  };
}

const SAFE_CATEGORIES = ["imports", "file-placement", "dead-code"] as const;
const REVIEW_CATEGORIES = ["typecheck", "logic", "known-errors"] as const;

describe("classifySafety — categorie sicure (allowlist)", () => {
  for (const category of SAFE_CATEGORIES) {
    it(`marca 🟢 un fix '${category}' meccanico, non critico, senza pattern rischiosi`, () => {
      const r = make({ category, severity: "warning", description: "fix additivo innocuo" });
      expect(classifySafety(r)).toBe(true);
    });

    it(`marca 🟢 un fix '${category}' info`, () => {
      const r = make({ category, severity: "info", description: "fix additivo innocuo" });
      expect(classifySafety(r)).toBe(true);
    });
  }
});

describe("classifySafety — categorie da rivedere (fuori allowlist)", () => {
  for (const category of REVIEW_CATEGORIES) {
    it(`marca 🔴 sempre la categoria '${category}', anche con severità info e descrizione innocua`, () => {
      const r = make({ category, severity: "info", description: "modifica banale" });
      expect(classifySafety(r)).toBe(false);
    });
  }

  it("marca 🔴 una categoria sconosciuta/non in allowlist", () => {
    const r = make({ category: "categoria-inventata", severity: "info" });
    expect(classifySafety(r)).toBe(false);
  });
});

describe("classifySafety — override severità critica", () => {
  for (const category of SAFE_CATEGORIES) {
    it(`declassa 🔴 un fix critico anche nella categoria sicura '${category}'`, () => {
      const r = make({ category, severity: "critical", description: "fix additivo innocuo" });
      expect(classifySafety(r)).toBe(false);
    });
  }
});

describe("classifySafety — override pattern rischiosi", () => {
  const riskyDescriptions: Array<[string, string]> = [
    ["refactor", "richiede refactor del modulo"],
    ["business logic (it)", "tocca la logica di business del matching"],
    ["business logic (en)", "changes core business logic"],
    ["password", "gestione della password utente"],
    ["token", "rotazione del token di sessione"],
    ["secret", "espone un secret nel client"],
    ["migration", "richiede una migration del DB"],
    ["schema", "modifica lo schema della tabella"],
    ["endpoint", "cambia un endpoint REST"],
    ["metodo http", "cambia il metodo http della route"],
    ["race condition", "possibile race condition sul pool"],
    ["rinomina", "rinominare la variabile esportata"],
    ["rename", "rename of the exported symbol"],
    ["spostare funzione", "spostare la funzione di calcolo altrove"],
  ];

  for (const [label, description] of riskyDescriptions) {
    it(`declassa 🔴 un fix in categoria sicura con pattern rischioso: ${label}`, () => {
      const r = make({ category: "dead-code", severity: "info", description });
      expect(classifySafety(r)).toBe(false);
    });
  }

  it("scatta sul pattern rischioso anche quando compare nel checkId", () => {
    const r = make({ category: "imports", checkId: "IM-rename-symbol", severity: "warning", description: "ok" });
    expect(classifySafety(r)).toBe(false);
  });

  it("NON declassa quando il pattern rischioso non è presente", () => {
    const r = make({ category: "file-placement", severity: "warning", description: "spostare il file helper in components/" });
    expect(classifySafety(r)).toBe(true);
  });
});

describe("classifySafety — risultati realistici dai checker", () => {
  it("IM-broken (import non risolvibile) è critico → 🔴", () => {
    const r = make({
      checkId: "IM-broken",
      category: "imports",
      severity: "critical",
      description: "Import relativo non risolvibile: '../foo'",
    });
    expect(classifySafety(r)).toBe(false);
  });

  it("FP-tabs-pollution (file helper in tabs) è 🟢", () => {
    const r = make({
      checkId: "FP-tabs-pollution",
      category: "file-placement",
      severity: "warning",
      description: "File helper dentro app/(tabs)/ → la custom tab bar lo renderizza come tab rotta. Spostare in components/",
    });
    expect(classifySafety(r)).toBe(true);
  });

  it("FP-orphan-stub (stub orfano) è 🟢", () => {
    const r = make({
      checkId: "FP-orphan-stub",
      category: "file-placement",
      severity: "info",
      description: "File .partN/.next vuoto: stub orfano, valutare rimozione",
    });
    expect(classifySafety(r)).toBe(true);
  });

  it("DC-unused (dead code) è 🟢", () => {
    const r = make({
      checkId: "DC-unused",
      category: "dead-code",
      severity: "info",
      description: "Modulo 'foo' non risulta importato da altri file (possibile dead-code)",
    });
    expect(classifySafety(r)).toBe(true);
  });

  it("TC-* (typecheck) è 🔴", () => {
    const r = make({
      checkId: "TS2322",
      category: "typecheck",
      severity: "critical",
      description: "Type 'string' is not assignable to type 'number'",
    });
    expect(classifySafety(r)).toBe(false);
  });

  it("LG-* (logic) è 🔴", () => {
    const r = make({
      checkId: "LG-router-deps",
      category: "logic",
      severity: "warning",
      description: "router nelle deps di useEffect che fa router.replace/push → rischio loop 'Maximum update depth'",
    });
    expect(classifySafety(r)).toBe(false);
  });

  it("KE-* (known-errors) è 🔴", () => {
    const r = make({
      checkId: "KE-FIXME",
      category: "known-errors",
      severity: "warning",
      description: "Marcatore FIXME nel codice",
    });
    expect(classifySafety(r)).toBe(false);
  });
});

describe("annotateSafety", () => {
  it("scrive safeFix su ogni risultato, idempotente", () => {
    const results: CheckResult[] = [
      make({ category: "dead-code", severity: "info" }),
      make({ category: "typecheck", severity: "critical" }),
      make({ category: "imports", severity: "warning", description: "fix innocuo" }),
    ];
    const annotated = annotateSafety(results);
    expect(annotated.map((r) => r.safeFix)).toEqual([true, false, true]);
    // Idempotenza: rieseguire non cambia il risultato.
    const again = annotateSafety(annotated);
    expect(again.map((r) => r.safeFix)).toEqual([true, false, true]);
  });

  it("ritorna lo stesso array (muta in place)", () => {
    const results: CheckResult[] = [make({ category: "imports", description: "ok" })];
    expect(annotateSafety(results)).toBe(results);
  });
});

describe("classifySafety — matrice severità × categoria", () => {
  const severities: Severity[] = ["critical", "warning", "info"];
  for (const category of SAFE_CATEGORIES) {
    for (const severity of severities) {
      const expected = severity !== "critical";
      it(`${category} + ${severity} → ${expected ? "🟢" : "🔴"}`, () => {
        const r = make({ category, severity, description: "fix innocuo" });
        expect(classifySafety(r)).toBe(expected);
      });
    }
  }
});
