import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./server/__tests__/setup/unit-environment.ts"],
    include: ["server/__tests__/**/*.test.ts"],
    globals: true,
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "shared"),
      "@": path.resolve(__dirname),
    },
  },
});
