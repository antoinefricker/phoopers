/**
 * Where to go after signing in: an in-app path only, never another site, defaulting to the home
 * screen. The candidate is resolved the way the browser will resolve it, so shapes the URL parser
 * normalises (`/\evil`, a tab or newline between slashes) cannot slip through a prefix test.
 */
export function safeNext(next: string | null): string {
  if (next === null) return '/';
  const resolved = new URL(next, window.location.origin);
  if (resolved.origin !== window.location.origin) return '/';
  const path = `${resolved.pathname}${resolved.search}${resolved.hash}`;
  // A normalised path such as `//host` would be read by the router as an absolute address.
  return /^\/(?![/\\])/.test(path) ? path : '/';
}
