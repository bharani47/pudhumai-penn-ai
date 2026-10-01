/**
 * @fileoverview Next.js application configuration with enterprise security headers.
 *
 * Security header strategy
 * ────────────────────────
 * All headers are applied to every route via a catch-all `source: "/(.*)"`.
 * They are identical to the OWASP Secure Headers Project recommendations and
 * satisfy automated scanners (securityheaders.com, Mozilla Observatory).
 *
 * Headers added:
 *
 * | Header                    | Value                        | Purpose                                    |
 * |---------------------------|------------------------------|--------------------------------------------|
 * | Strict-Transport-Security | max-age=63072000; includeSubDomains; preload | Force HTTPS for 2 years     |
 * | X-Frame-Options           | DENY                         | Prevent clickjacking via iframes           |
 * | X-Content-Type-Options    | nosniff                      | Block MIME-type sniffing attacks            |
 * | Referrer-Policy           | strict-origin-when-cross-origin | Minimal referrer leakage               |
 * | Permissions-Policy        | camera=(), microphone=(self) | Restrict camera; allow mic (needed for STT)|
 * | Content-Security-Policy   | See inline comment           | Defence-in-depth against XSS/injection     |
 *
 * Content-Security-Policy rationale
 * ───────────────────────────────────
 * - `default-src 'self'`         — only load resources from own origin by default.
 * - `script-src 'self' 'unsafe-inline'` — Next.js requires inline scripts for
 *   hydration; `unsafe-eval` is intentionally excluded.
 * - `style-src 'self' 'unsafe-inline'` — Tailwind generates inline styles.
 * - `font-src 'self' https://fonts.gstatic.com` — Noto Sans Tamil from Google Fonts CDN.
 * - `connect-src 'self' https://generativelanguage.googleapis.com` — Gemini API calls
 *   originate server-side, but this covers any future client-side SDK usage.
 * - `img-src 'self' data:` — emoji rendered as images in some browsers use data URIs.
 * - `frame-ancestors 'none'` — stronger than X-Frame-Options for modern browsers.
 * - `upgrade-insecure-requests` — auto-upgrade HTTP sub-resource requests to HTTPS.
 *
 * @module next.config
 * @see {@link https://nextjs.org/docs/app/api-reference/next-config-js/headers}
 * @see {@link https://owasp.org/www-project-secure-headers/}
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * HTTP response headers injected by Next.js into every server response.
   *
   * Using `async headers()` (rather than middleware) keeps the logic
   * co-located with the framework config and requires zero runtime overhead —
   * headers are added by the Next.js server/edge runtime directly.
   *
   * @returns {Promise<import('next').NextConfig['headers'] extends () => Promise<infer R> ? R : never>}
   */
  async headers() {
    return [
      {
        /**
         * Apply to ALL routes including API endpoints, static assets,
         * and the root page.
         */
        source: "/(.*)",
        headers: [
          // ── Transport Security ──────────────────────────────────────────
          {
            key: "Strict-Transport-Security",
            /**
             * Instructs browsers to use HTTPS exclusively for 2 years
             * (63072000 seconds), including all subdomains.
             * `preload` opts into the HSTS preload list so even the very
             * first visit is over HTTPS.
             */
            value: "max-age=63072000; includeSubDomains; preload",
          },

          // ── Clickjacking protection ─────────────────────────────────────
          {
            key: "X-Frame-Options",
            /**
             * `DENY` prevents the page from being embedded in any `<iframe>`,
             * `<frame>`, or `<object>` — even from the same origin.
             * Superseded by `frame-ancestors 'none'` in CSP for modern
             * browsers, but kept for legacy browser compatibility.
             */
            value: "DENY",
          },

          // ── MIME sniffing protection ────────────────────────────────────
          {
            key: "X-Content-Type-Options",
            /**
             * Prevents browsers from trying to guess (sniff) the MIME type
             * of a response, which can lead to XSS via polyglot files.
             */
            value: "nosniff",
          },

          // ── Referrer policy ─────────────────────────────────────────────
          {
            key: "Referrer-Policy",
            /**
             * Sends the full URL as the Referer header for same-origin
             * requests, but only the origin (no path/query) for cross-origin
             * requests, and nothing at all when downgrading HTTPS → HTTP.
             */
            value: "strict-origin-when-cross-origin",
          },

          // ── Permissions policy ──────────────────────────────────────────
          {
            key: "Permissions-Policy",
            /**
             * - `camera=()` — no page may request camera access.
             * - `microphone=(self)` — only the app's own origin may request
             *   microphone access (required for the SpeechRecognition API).
             * - `geolocation=()` — location access disabled.
             * - `payment=()` — payment API disabled.
             */
            value: "camera=(), microphone=(self), geolocation=(), payment=()",
          },

          // ── Content Security Policy ─────────────────────────────────────
          {
            key: "Content-Security-Policy",
            /**
             * Layered defence against XSS and injection attacks.
             *
             * `unsafe-inline` is required for:
             *  - Next.js hydration inline scripts
             *  - Tailwind utility classes (which may generate style attrs)
             *
             * `unsafe-eval` is intentionally NOT included.
             *
             * `https://fonts.gstatic.com` is whitelisted for Noto Sans Tamil
             * font files served from Google's CDN.
             */
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data:",
              "connect-src 'self' https://generativelanguage.googleapis.com",
              "frame-ancestors 'none'",
              "upgrade-insecure-requests",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
