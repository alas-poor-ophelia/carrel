/**
 * ESLint configuration for Carrel (Obsidian plugin)
 *
 * Flat config (ESLint 9+). Mirrors the Windrose setup: typescript-eslint wired
 * manually for project-specific strictness, react-hooks for Preact, and the
 * official `eslint-plugin-obsidianmd` recommended set (which itself spreads
 * typescript-eslint type-checked + @microsoft/sdl + import + depend).
 *
 * Type-aware rules require `parserOptions.project`; it points at tsconfig.json,
 * which includes src/ and tests/.
 */

import tsparser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import obsidianmd from "eslint-plugin-obsidianmd";

export default [
  // ===========================================
  // Plugin source (Preact + TypeScript)
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
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "react-hooks": reactHooksPlugin,
      obsidianmd: obsidianmd,
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
      "@typescript-eslint/no-misused-promises": ["warn", {
        checksVoidReturn: { attributes: false },
      }],
      "@typescript-eslint/consistent-type-imports": ["warn", {
        prefer: "type-imports",
        fixStyle: "separate-type-imports",
      }],
      "@typescript-eslint/no-unnecessary-type-assertion": "warn",
      "@typescript-eslint/prefer-nullish-coalescing": "warn",

      // --- React/Preact hooks ---
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // --- Standard ESLint ---
      "no-unreachable": "error",
      // Obsidian's guidelines permit warn/error/debug; only plain console.log is noise.
      "no-console": ["warn", { allow: ["warn", "error", "debug"] }],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "prefer-const": "error",

      // --- Obsidian community plugin rules (recommended) ---
      ...obsidianmd.configs.recommended,
    },
  },

  // ===========================================
  // Unit tests (vitest)
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
      "no-console": "off",
    },
  },

  // ===========================================
  // Ignore patterns
  // ===========================================
  {
    ignores: [
      "node_modules/**",
      "mcp/**",
      "carrel-test-vault/**",
      "*.md",
      // Build artifacts
      "main.js",
      "styles.css",
      // Build/deploy scripts (plain .mjs, not part of the typed project)
      "*.mjs",
      "scripts/**",
      // Legacy/compiled JS
      "src/**/*.js",
      "src/**/*.jsx",
    ],
  },
];
