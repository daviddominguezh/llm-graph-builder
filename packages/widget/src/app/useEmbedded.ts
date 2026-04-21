export function isEmbedded(): boolean {
  try {
    // Opaque-origin parent (most cross-origin iframes) throws on access.
    return window.self !== window.top;
  } catch {
    return true;
  }
}
