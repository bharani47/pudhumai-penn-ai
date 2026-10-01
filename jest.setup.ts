/**
 * @fileoverview Jest global setup file.
 *
 * Imported once per test suite run (after the Jest framework itself is
 * initialised) via `setupFilesAfterFramework` in jest.config.mjs.
 *
 * Extends Jest's `expect` with the full set of
 * {@link https://github.com/testing-library/jest-dom | @testing-library/jest-dom}
 * matchers such as `toBeInTheDocument`, `toHaveAttribute`, and `toBeVisible`.
 */
import "@testing-library/jest-dom";
