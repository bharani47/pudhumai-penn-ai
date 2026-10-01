/**
 * @fileoverview Root layout for the Pudhumai Penn AI Navigator PWA.
 *
 * Next.js 14 compliance notes
 * ───────────────────────────
 * - `viewport` and `themeColor` are exported as their own typed constants
 *   (`generateViewport` / `Viewport`) rather than being nested inside the
 *   `Metadata` object.  Placing them inside `metadata` is deprecated in
 *   Next.js 14 and emits a console warning during build and runtime.
 *
 * - `next/font/google` is used to load **Noto Sans Tamil** with zero
 *   layout shift (CLS = 0) because the font is inlined as a CSS variable
 *   at build time — no runtime network request, no FOUT.
 *
 * @module app/layout
 * @see {@link https://nextjs.org/docs/app/api-reference/functions/generate-viewport}
 * @see {@link https://nextjs.org/docs/app/building-your-application/optimizing/fonts}
 */

import type { Metadata, Viewport } from "next";
import { Noto_Sans_Tamil } from "next/font/google";
import "./globals.css";

// ─── Font ─────────────────────────────────────────────────────────────────────

/**
 * Noto Sans Tamil loaded via `next/font/google`.
 *
 * Benefits over a plain `<link>` tag:
 * - Self-hosted at build time → zero third-party font network request.
 * - `display: swap` prevents invisible text during font load (FOIT).
 * - Eliminates layout shift (CLS) because Next.js pre-calculates the
 *   fallback font metrics to match Noto Sans Tamil exactly.
 *
 * The `variable` option exposes the font as a CSS custom property
 * (`--font-noto-tamil`) so Tailwind or raw CSS can reference it.
 */
const notoSansTamil = Noto_Sans_Tamil({
  /**
   * Subset to Tamil + Latin to keep the woff2 payload minimal.
   * Latin is included so English UI strings (e.g. "Voice Navigator")
   * also render with the same typeface.
   */
  subsets: ["tamil", "latin"],
  /**
   * Include only the weights actually used in the UI.
   * 400 = body text, 700 = bold header.
   */
  weight: ["400", "700"],
  /** Prevent invisible text flash during font swap. */
  display: "swap",
  /** CSS variable name for Tailwind / global CSS usage. */
  variable: "--font-noto-tamil",
});

// ─── Viewport (Next.js 14 — separate from Metadata) ──────────────────────────

/**
 * Viewport configuration, exported as a standalone `Viewport` constant.
 *
 * In Next.js 14, placing `viewport` or `themeColor` inside the `metadata`
 * object triggers a deprecation warning.  They must be exported separately,
 * either as `viewport` (static) or `generateViewport` (dynamic).
 *
 * @see {@link https://nextjs.org/docs/app/api-reference/functions/generate-viewport}
 */
export const viewport: Viewport = {
  /**
   * Disable user-scaling to enforce the fixed mobile layout.
   * `maximum-scale=1` also prevents iOS auto-zoom on input focus.
   */
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  /**
   * Sets the browser chrome / status-bar colour on supported Android browsers
   * to match the app's green header.  Must be in `viewport`, NOT `metadata`.
   */
  themeColor: "#16a34a",
};

// ─── Metadata ─────────────────────────────────────────────────────────────────

/**
 * Static metadata for the application.
 *
 * `viewport` and `themeColor` are intentionally absent here — they live
 * in the exported {@link viewport} constant above per Next.js 14 spec.
 *
 * @see {@link https://nextjs.org/docs/app/api-reference/functions/generate-metadata}
 */
export const metadata: Metadata = {
  title: "புதுமை பெண் AI Navigator",
  description:
    "Zero-barrier Tamil-language voice assistant guiding rural women in Tamil Nadu to the Pudhumai Penn higher-education financial scheme.",
  /**
   * Links the PWA `manifest.json` so browsers offer an
   * "Add to Home Screen" prompt.
   */
  manifest: "/manifest.json",
  /**
   * Open Graph tags improve link previews when the URL is shared on
   * WhatsApp, the primary communication channel for the target audience.
   */
  openGraph: {
    title: "புதுமை பெண் AI Navigator",
    description: "Pudhumai Penn scheme voice assistant in Tamil.",
    type: "website",
    locale: "ta_IN",
  },
};

// ─── Layout component ─────────────────────────────────────────────────────────

/**
 * Root layout component wrapping every page in the application.
 *
 * Responsibilities:
 * 1. Sets `lang="ta"` on `<html>` so screen readers and TTS engines select
 *    an appropriate Tamil voice by default.
 * 2. Applies the Noto Sans Tamil font via a CSS class and variable.
 * 3. Renders the `{children}` slot where `app/page.tsx` is injected.
 *
 * @param props.children - The page content rendered by Next.js App Router.
 * @returns The full HTML document shell.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ta" className={notoSansTamil.variable}>
      {/*
       * `notoSansTamil.className` applies the font directly.
       * `antialiased` is a Tailwind utility that enables font smoothing
       * for sharper text rendering on high-DPI screens.
       */}
      <body className={`${notoSansTamil.className} antialiased`}>
        {children}
      </body>
    </html>
  );
}
