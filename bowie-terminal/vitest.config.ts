import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Il terminale è standalone: ha un suo runner isolato dal repo madre.
// root punta a questa cartella così l'include è relativo a bowie-terminal/.
const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  resolve: {
    alias: {
      // react-native usa Flow (non parsable da Rolldown in SSR/node).
      // Il mock esporta solo i simboli usati da bowie-client.ts nei test.
      "react-native": resolve(root, "__mocks__/react-native.ts"),
    },
  },
  test: {
    environment: "node",
    globals: false,
    include: ["lib/__tests__/**/*.test.ts"],
  },
});
