/**
 * Origin for WebSockets (scheme + host[:port], no path).
 *
 * - Set NEXT_PUBLIC_WS_URL in production (must be wss:// when the site is HTTPS).
 * - If unset on an HTTPS page, uses wss + current host (your reverse proxy must forward /ws/* to the gateway).
 * - If unset on HTTP (typical local dev), uses ws://localhost:8000 so the browser talks to the gateway directly.
 */
export function getWebSocketBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_WS_URL?.trim();
  const pageIsHttps =
    typeof window !== 'undefined' && window.location.protocol === 'https:';

  if (raw) {
    const withScheme = raw.includes('://') ? raw : `ws://${raw}`;
    try {
      const u = new URL(withScheme);
      // ws:// or http:// from env on an HTTPS site → mixed content / broken; use same host wss.
      if (pageIsHttps && (u.protocol === 'ws:' || u.protocol === 'http:')) {
        return `wss://${window.location.host}`;
      }
      return `${u.protocol}//${u.host}`;
    } catch {
      return raw.replace(/\/$/, '');
    }
  }
  if (typeof window === 'undefined') {
    return 'ws://localhost:8000';
  }
  if (pageIsHttps) {
    return `wss://${window.location.host}`;
  }
  return 'ws://localhost:8000';
}
