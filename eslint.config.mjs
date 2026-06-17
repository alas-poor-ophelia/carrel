/**
 * ESLint configuration for Carrel (Obsidian plugin)
 *
 * Flat config (ESLint 9+). The official community ruleset is
 * `eslint-plugin-obsidianmd` — and in 0.3.0 `configs.recommended` is a full flat
 * config ARRAY (typescript-eslint base + recommended + recommended-type-checked,
 * the obsidianmd plugin, and its rules). It MUST be spread at the top level of
 * the array — spreading it inside a `rules: {}` block (the previous bug) silently
 * dropped every rule, which is why local lint passed while the store's check did
 * not. This config now reproduces the store's check exactly.
 *
 * The recommended set wires the TS parser but leaves `parserOptions.project` to
 * the consumer; the type-aware rules need it, so the Carrel override block below
 * points it at tsconfig.json (which includes src/ and tests/).
 */

import tsparser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import obsidianmd from "eslint-plugin-obsidianmd";

export default [
  // ===========================================
  // Ignore patterns (global — a config with only `ignores`)
  // ===========================================
  {
    ignores: [
      "node_modules/**",
      "mcp/**",
      "carrel-test-vault/**",
      "*.md",
      // JSON (manifest/license validation is the store's own pass; locally these
      // would crash the type-requiring obsidianmd rules — no TS type info on JSON)
      "**/*.json",
      // Build artifacts
      "main.js",
      "styles.css",
      // Build/deploy scripts (plain .mjs, not part of the typed project)
      "*.mjs",
      // Root config TS not in the tsconfig project (no type info)
      "*.config.ts",
      "scripts/**",
      // Legacy/compiled JS
      "src/**/*.js",
      "src/**/*.jsx",
    ],
  },

  // ===========================================
  // Official Obsidian community ruleset (the store's check)
  // typescript-eslint type-checked + obsidianmd, spread at top level.
  // ===========================================
  ...obsidianmd.configs.recommended,

  // ===========================================
  // Plugin source (Preact + TypeScript) — type info + project strictness
  // ===========================================
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: "./tsconfig.json",
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
      // esbuild define (see esbuild.config.mjs) — a compile-time injected global.
      globals: { __BUILD_STAMP__: "readonly" },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "react-hooks": reactHooksPlugin,
    },
    rules: {
      // --- TypeScript strictness ---
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/explicit-function-return-type": ["warn", {
        allowExpressions: true,
        allowTypedFunctionExpressions: true,
      }],
      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
        ignoreRestSiblings: true,
      }],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/strict-boolean-expressions": "warn",
      "@typescript-eslint/no-non-null-assertion": "warn",
      // Match the store: void-return attributes ARE checked (Preact onClick etc.
      // must not be handed a promise-returning function).
      "@typescript-eslint/no-misused-promises": ["warn", {
        checksVoidReturn: { attributes: true },
      }],
      "@typescript-eslint/consistent-type-imports": ["warn", {
        prefer: "type-imports",
        fixStyle: "separate-type-imports",
      }],
      "@typescript-eslint/no-unnecessary-type-assertion": "warn",
      "@typescript-eslint/prefer-nullish-coalescing": "warn",
      // The store reports API deprecations as non-blocking Recommendations, not
      // errors; mirror that so a deprecation can't fail an otherwise-clean lint.
      "@typescript-eslint/no-deprecated": "warn",

      // --- React/Preact hooks ---
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // --- Standard ESLint ---
      "no-unreachable": "error",
      // Obsidian's guidelines permit warn/error/debug; only plain console.log is noise.
      "no-console": ["warn", { allow: ["warn", "error", "debug"] }],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "prefer-const": "error",
    },
  },

  // ===========================================
  // Unit tests (vitest) — type-checked rules off, test ergonomics on
  // ===========================================
  {
    files: ["tests/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: "./tsconfig.json",
        ecmaVersion: 2022,
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "no-console": "off",
    },
  },
];
