/**
 * Session cookie signing. Runs in the edge runtime (middleware) as well as in
 * route handlers, so it uses Web Crypto only — no node:crypto.
 */
export const COOKIE = "sb_session";
const TTL_MS = 12 * 60 * 60 * 1000;

function secretMaterial(): string {
  const s = process.env.AUTH_SECRET || process.env.APP_PASSWORD;
  if (!s) throw new Error("APP_PASSWORD is not set");
  return s;
}

async function key(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secretMaterial()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signSession(expiresAt = Date.now() + TTL_MS): Promise<string> {
  const payload = String(expiresAt);
  const mac = await crypto.subtle.sign("HMAC", await key(), new TextEncoder().encode(payload));
  return `${payload}.${toHex(mac)}`;
}

export async function verifySession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return false;
  const payload = token.slice(0, dot);
  const mac = token.slice(dot + 1);

  const expected = await crypto.subtle
    .sign("HMAC", await key(), new TextEncoder().encode(payload))
    .then(toHex)
    .catch(() => null);
  if (!expected || !timingSafeEqual(mac, expected)) return false;

  const expiresAt = Number(payload);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

/** Length-independent comparison, so a wrong MAC leaks nothing through timing. */
export function timingSafeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/**
 * The console can start real phone calls billed to the operator's accounts, so
 * an unauthenticated deployment must never serve. Localhost is exempt only when
 * no password is configured at all, to keep local development frictionless.
 */
export function authMode(host: string | null): "open-local" | "password" | "misconfigured" {
  const isLocal = !host || /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  if (process.env.APP_PASSWORD) return "password";
  return isLocal ? "open-local" : "misconfigured";
}
