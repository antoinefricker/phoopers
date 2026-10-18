/**
 * Where to go after signing in: an in-app path only, never another site, defaulting to the home
 * screen. The candidate is resolved the way the browser will resolve it, so shapes the URL parser
 * normalises (`/\evil`, a tab or newline between slashes) cannot slip through a prefix test.
 */
export function safeNext(next: string | null): string {
  if (next === null) return '/';
  // A candidate the parser refuses (`https://[`) is not a path either: it is called during
  // render, and a thrown TypeError would take the whole screen down with it.
  let resolved: URL;
  try {
    resolved = new URL(next, window.location.origin);
  } catch {
    return '/';
  }
  if (resolved.origin !== window.location.origin) return '/';
  const path = `${resolved.pathname}${resolved.search}${resolved.hash}`;
  // A normalised path such as `//host` would be read by the router as an absolute address.
  return /^\/(?![/\\])/.test(path) ? path : '/';
}
