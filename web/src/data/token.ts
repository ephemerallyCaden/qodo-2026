// The per-launch token (R14): `commet open` opens `http://127.0.0.1:<port>/#t=<token>`. The fragment
// never reaches the server; the view reads it here and sends it in TOKEN_HEADER. Pure.

/** Tokens are URL-safe and bounded, so nothing else rides into a request header. */
const TOKEN = /^[A-Za-z0-9_-]{16,256}$/;

/** The token in a location hash (`#t=<token>`, other `&`-separated keys ignored), or null. */
export function tokenFromHash(hash: string): string | null {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const t = params.get('t');
  return t !== null && TOKEN.test(t) ? t : null;
}
