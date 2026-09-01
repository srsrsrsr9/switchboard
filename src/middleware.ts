import { NextResponse, type NextRequest } from "next/server";
import { authMode, COOKIE, verifySession } from "@/lib/auth";

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login|api/login).*)"],
};

export async function middleware(req: NextRequest) {
  const mode = authMode(req.headers.get("host"));

  if (mode === "open-local") return NextResponse.next();

  if (mode === "misconfigured") {
    return new NextResponse(
      "This deployment has no APP_PASSWORD set. Refusing to serve a console that can place " +
        "outbound calls. Set APP_PASSWORD in the host's environment and redeploy.",
      { status: 503, headers: { "content-type": "text/plain" } },
    );
  }

  if (await verifySession(req.cookies.get(COOKIE)?.value)) return NextResponse.next();

  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}
