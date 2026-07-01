import { describe, it, expect } from "vitest";
import {
  nextPrefix,
  sanitizeDescription,
  findUnknownDuplicates,
} from "../../scripts/new-migration";

describe("new-migration scaffolder — nextPrefix", () => {
  it("restituisce 0000 su cartella vuota (width di default = 4)", () => {
    expect(nextPrefix([])).toBe("0000");
  });

  it("calcola max esistente + 1, zero-padded alla stessa larghezza", () => {
    const files = ["0001_a.sql", "0002_b.sql", "0005_c.sql"];
    expect(nextPrefix(files)).toBe("0006");
  });

  it("ignora file senza prefisso numerico iniziale", () => {
    const files = ["0001_a.sql", "README.md", "not_a_migration.sql"];
    expect(nextPrefix(files)).toBe("0002");
  });

  it("usa la larghezza massima vista tra prefissi di lunghezza mista", () => {
    // Un prefisso a 5 cifre alza la width anche se il max numerico resta 99999.
    const files = ["0001_a.sql", "99999_b.sql"];
    expect(nextPrefix(files)).toBe("100000".padStart(5, "0"));
  });

  it("non si confonde con prefissi numerici non contigui o fuori ordine", () => {
    const files = ["0010_a.sql", "0003_b.sql", "0007_c.sql"];
    expect(nextPrefix(files)).toBe("0011");
  });

  it("mantiene la width a 4 se tutti i prefissi esistenti sono più corti", () => {
    const files = ["1_a.sql", "2_b.sql"];
    expect(nextPrefix(files)).toBe("0003");
  });
});

describe("new-migration scaffolder — findUnknownDuplicates", () => {
  it("nessun duplicato → array vuoto", () => {
    const files = ["0001_a.sql", "0002_b.sql", "0003_c.sql"];
    expect(findUnknownDuplicates(files)).toEqual([]);
  });

  it("rileva un prefisso duplicato sconosciuto (non in baseline)", () => {
    const files = ["0001_a.sql", "0002_b.sql", "0002_c.sql"];
    const result = findUnknownDuplicates(files);
    expect(result).toHaveLength(1);
    expect(result[0][0]).toBe("0002");
    expect(result[0][1]).toEqual(["0002_b.sql", "0002_c.sql"]);
  });

  it("KNOWN_DUPLICATE_FILE_SETS è vuota nella baseline attuale: qualsiasi duplicato è sconosciuto", () => {
    // La baseline storica (0067/0072) è stata bonificata e rimossa; qualunque
    // nuovo duplicato, anche con nomi plausibili, deve risultare sconosciuto.
    const files = ["0067_a.sql", "0067_b.sql"];
    const result = findUnknownDuplicates(files);
    expect(result).toHaveLength(1);
    expect(result[0][0]).toBe("0067");
  });
});

describe("new-migration scaffolder — sanitizeDescription", () => {
  it("converte spazi e maiuscole in snake_case valido", () => {
    expect(sanitizeDescription("Add SOS Events")).toBe("add_sos_events");
  });

  it("rimuove caratteri non alfanumerici collassandoli in underscore singoli", () => {
    expect(sanitizeDescription("fix--user's  email!!")).toBe(
      "fix_user_s_email",
    );
  });

  it("rimuove underscore iniziali e finali residui", () => {
    expect(sanitizeDescription("  __weird__input__  ")).toBe("weird_input");
  });

  it("stringa vuota o solo simboli → stringa vuota (rifiutata dal chiamante)", () => {
    expect(sanitizeDescription("")).toBe("");
    expect(sanitizeDescription("   ")).toBe("");
    expect(sanitizeDescription("!!!---***")).toBe("");
  });

  it("preserva numeri e underscore già presenti", () => {
    expect(sanitizeDescription("add_column_v2")).toBe("add_column_v2");
  });
});
