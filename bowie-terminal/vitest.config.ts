import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

// Il terminale è standalone: ha un suo runner isolato dal repo madre.
// root punta a questa cartella così l'include è relativo a bowie-terminal/.
const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  test: {
    environment: "node",
    globals: false,
    include: ["lib/__tests__/**/*.test.ts"],
  },
});
