const { defineConfig } = require('eslint/config');
const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const reactHooksPlugin = require('eslint-plugin-react-hooks');
const unusedImportsPlugin = require('eslint-plugin-unused-imports');

module.exports = defineConfig([
  {
    ignores: [
      "dist/**",
      "dist-ota-env/**",
      "server_dist/**",
      "node_modules/**",
      "static-build/**",
      ".expo/**",
      ".local/**",
      ".agents/**",
      "migrations/**",
      "mocks/**",
      "exports/**",
      "graphhopper/**",
      "website/**",
      "android/**",
      "tmp_*/**",
      "uploads/**",
      "logs/**",
      "scripts/eslint-report.mjs",
    ],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "react-hooks": reactHooksPlugin,
      "unused-imports": unusedImportsPlugin,
    },
    rules: {
      // ── variabili inutilizzate ──────────────────────────────
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
        },
      ],

      // ── any espliciti ────────────────────────────────────────
      "@typescript-eslint/no-explicit-any": "warn",

      // ── React Hooks ──────────────────────────────────────────
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // ── qualità generale ─────────────────────────────────────
      "no-undef": "off",
      "no-redeclare": "off",
      "@typescript-eslint/no-redeclare": "warn",
      "no-constant-condition": "warn",
      "no-debugger": "warn",
      "no-duplicate-case": "error",
      "no-empty": "warn",
      "no-unreachable": "warn",
      "prefer-const": "warn",
      "eqeqeq": ["warn", "always", { null: "ignore" }],
    },
  },
  {
    files: ["server/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "unused-imports": unusedImportsPlugin,
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-constant-condition": "warn",
      "no-debugger": "warn",
      "prefer-const": "warn",
      "eqeqeq": ["warn", "always", { null: "ignore" }],
    },
  },
]);
