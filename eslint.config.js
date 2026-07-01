const { defineConfig } = require('eslint/config');
const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const reactHooksPlugin = require('eslint-plugin-react-hooks');
const unusedImportsPlugin = require('eslint-plugin-unused-imports');
const noPartNavRule = require('./scripts/eslint-rules/no-part-nav');

const localRulesPlugin = {
  rules: {
    'no-part-nav': noPartNavRule,
  },
};

module.exports = defineConfig([
  {
    ignores: [
      "dist/**",
      "dist-ota-env/**",
      "server_dist/**",
      "node_modules/**",
      "static-build/**",
      "bowie-terminal/**",
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
      "local-rules": localRulesPlugin,
    },
    rules: {
      // ── navigazione verso path .partN ─────────────────────
      // Cattura template-literal in chiamate push/replace/navigate/href
      // che contengono ".partN".  I path statici sono già coperti dal
      // grep gate in scripts/post-merge.sh; questa regola chiude il
      // gap per i path costruiti dinamicamente (template literal).
      "local-rules/no-part-nav": "error",

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
