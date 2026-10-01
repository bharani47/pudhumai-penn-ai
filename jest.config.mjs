/**
 * @fileoverview Jest configuration for Next.js 14 App Router.
 *
 * Uses `next/jest` to automatically configure:
 *  - SWC-based transforms (no Babel required)
 *  - CSS / image module mocks
 *  - `@/` path alias resolution
 *  - jsdom test environment for React component rendering
 *
 * @see {@link https://nextjs.org/docs/app/building-your-application/testing/jest}
 */

import nextJest from "next/jest.js";

/** Wrap Jest config with Next.js preset. */
const createJestConfig = nextJest({
  /** Path to the Next.js app root (where next.config.js lives). */
  dir: "./",
});

/**
 * Custom Jest configuration layered on top of the Next.js defaults.
 *
 * @type {import("jest").Config}
 */
const customConfig = {
  /** Use jsdom so React components can mount with a real DOM. */
  testEnvironment: "jest-environment-jsdom",

  /**
   * Map the `@/` import alias defined in tsconfig.json so Jest can
   * resolve the same paths the TypeScript compiler resolves.
   */
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },

  /**
   * Run this setup file after the test framework is installed.
   * Imports `@testing-library/jest-dom` which adds matchers like
   * `toBeInTheDocument`, `toHaveAttribute`, `toBeVisible`, etc.
   */
  setupFilesAfterFramework: ["<rootDir>/jest.setup.ts"],

  /**
   * Glob patterns that Jest considers test files.
   * Matches both `__tests__/*.test.tsx` and `*.spec.ts` conventions.
   */
  testMatch: [
    "**/__tests__/**/*.[jt]s?(x)",
    "**/?(*.)+(spec|test).[jt]s?(x)",
  ],

  /**
   * Collect coverage from source files only, not test files or config.
   */
  collectCoverageFrom: [
    "app/**/*.{ts,tsx}",
    "!app/**/*.d.ts",
    "!app/**/layout.tsx",
  ],
};

export default createJestConfig(customConfig);
