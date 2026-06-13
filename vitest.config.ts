import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: [
      "server/__tests__/**/*.test.ts",
      "hooks/__tests__/**/*.test.ts",
    ],
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
