import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: [
      "server/__tests__/**/*.test.ts",
      "hooks/__tests__/**/*.test.ts",
      "components/__tests__/**/*.test.ts",
      "shared/__tests__/**/*.test.ts",
      "lib/__tests__/**/*.test.ts",
      "lib/maps/__tests__/**/*.test.ts",
      "scripts/**/__tests__/**/*.test.ts",
    ],
    testTimeout: 15000,
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "shared"),
      "@": path.resolve(__dirname, "."),
    },
  },
  define: {
    __DEV__: "false",
  },
});
