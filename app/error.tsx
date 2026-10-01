/**
 * @fileoverview Global error boundary for the Pudhumai Penn AI Navigator.
 *
 * Next.js App Router automatically renders this component whenever an
 * unhandled error is thrown inside any Server Component, Client Component,
 * or layout within the same segment tree.
 *
 * Requirements for this file (enforced by Next.js):
 * - MUST be a Client Component (`"use client"` directive required).
 * - MUST export a default React component accepting `{ error, reset }` props.
 * - The `error` prop is always an `Error` instance (Next.js guarantees this).
 * - The `reset` prop is a `() => void` callback that attempts to re-render
 *   the failed segment, giving the user a recovery path without a full reload.
 *
 * UX design decision
 * ──────────────────
 * For zero-literacy rural users, displaying a raw JavaScript error stack
 * trace is worse than useless.  This boundary catches any crash and shows
 * a single, calm Tamil sentence alongside a retry button.
 *
 * @module app/error
 * @see {@link https://nextjs.org/docs/app/api-reference/file-conventions/error}
 */

"use client";

import { useEffect } from "react";

// ─── Props interface ──────────────────────────────────────────────────────────

/**
 * Props injected by Next.js App Router into every `error.tsx` component.
 *
 * @property error - The caught `Error` object. Next.js always provides an
 *                   `Error` instance here (never `unknown`), so no narrowing
 *                   is needed before accessing `error.message`.
 *                   In development, `error.message` contains the original
 *                   stack; in production it is sanitised by Next.js.
 * @property reset - Call this to attempt re-rendering the failed segment.
 *                   Internally it re-runs the nearest Suspense boundary.
 */
interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Global error boundary component rendered by Next.js on any unhandled error.
 *
 * Displays a Tamil fallback message and a single "retry" button so
 * first-time users are never left staring at a blank or broken screen.
 *
 * The component also logs the error to `console.error` so it remains
 * visible in server logs / Vercel's runtime log dashboard for debugging,
 * without exposing anything to the end user.
 *
 * @param props - Injected by Next.js; see {@link ErrorBoundaryProps}.
 * @returns A full-screen Tamil error fallback UI.
 *
 * @example
 * // Next.js discovers and uses this automatically — no manual wiring needed.
 * // Place this file at `app/error.tsx` and the framework handles the rest.
 */
export default function GlobalError({ error, reset }: ErrorBoundaryProps) {
  /**
   * Log the error server-side / in the browser console for developer
   * visibility.  `error.digest` is a Next.js-specific hash that correlates
   * this client-side error with the matching server-side log entry.
   */
  useEffect(() => {
    console.error(
      "[GlobalError] Unhandled application error:",
      error.message,
      error.digest ? `(digest: ${error.digest})` : "",
    );
  }, [error]);

  return (
    /*
     * Mirror the dark-themed layout so the error screen feels visually
     * consistent with the rest of the app rather than jarring.
     */
    <div
      className="flex flex-col items-center justify-center h-screen max-w-md mx-auto bg-gray-950 text-white px-6 text-center gap-6"
      role="alert"
      aria-live="assertive"
    >
      {/* Friendly visual icon */}
      <span className="text-6xl" role="img" aria-label="Sad face">😔</span>

      {/*
       * Primary error message in simple Tamil.
       * Translation: "Sorry, something went wrong.
       *               Please try again."
       */}
      <p className="text-gray-200 text-base leading-relaxed font-medium">
        மன்னிக்கவும், ஏதோ தவறு நடந்தது.
        <br />
        மீண்டும் முயற்சிக்கவும்.
      </p>

      {/*
       * Recovery button — calls `reset()` to re-render the failed segment.
       * Labelled in Tamil for consistency with the zero-English UI contract.
       */}
      <button
        onClick={reset}
        aria-label="மீண்டும் முயற்சிக்கவும் — Try again"
        className="rounded-full bg-green-600 hover:bg-green-500 active:scale-95 px-8 py-3 text-sm font-semibold text-white transition-all duration-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-green-400"
      >
        மீண்டும் முயற்சி
      </button>
    </div>
  );
}
