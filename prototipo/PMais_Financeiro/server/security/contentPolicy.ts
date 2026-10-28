/** Explicit read-only-release CSP. HTTPS script/connect sources accommodate changing platform CDN markup.
 * This is not the final strict nonce/allowlist policy for a future authenticated financial release. */
export function contentPolicy(development: boolean): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
    "script-src 'self' 'unsafe-inline' https:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    `connect-src 'self' https:${development ? " ws: wss:" : ""}`,
    "manifest-src 'self'",
  ].join("; ");
}
