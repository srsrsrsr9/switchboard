import { COOKIE, signSession, timingSafeEqual } from "@/lib/auth";
import { bad, ok } from "@/lib/api";

export const dynamic = "force-dynamic";

// Per-instance throttle. Not a substitute for a real limiter, but enough to make
// guessing over the network impractical on a single-operator console.
const attempts = new Map<string, { n: number; until: number }>();

export async function POST(req: Request) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return bad("No password is configured on this deployment.", 503);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rec = attempts.get(ip);
  if (rec && rec.until > Date.now()) {
    return bad("Too many attempts. Wait a minute and try again.", 429);
  }

  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  if (!password || !timingSafeEqual(password, expected)) {
    const n = (rec?.n ?? 0) + 1;
    attempts.set(ip, { n, until: n >= 5 ? Date.now() + 60_000 : 0 });
    await new Promise((r) => setTimeout(r, 400));
    return bad("That password is not right.", 401);
  }

  attempts.delete(ip);
  const res = ok({ signedIn: true });
  res.headers.append(
    "set-cookie",
    `${COOKIE}=${await signSession()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${
      process.env.NODE_ENV === "production" ? "; Secure" : ""
    }`,
  );
  return res;
}

export async function DELETE() {
  const res = ok({ signedIn: false });
  res.headers.append("set-cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  return res;
}
