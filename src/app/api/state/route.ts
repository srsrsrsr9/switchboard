import { getStore } from "@/lib/store";
import { canCallNow, contactLocalTime } from "@/lib/compliance";
import { resumeIfRunning } from "@/lib/dialer";
import { ok } from "@/lib/api";
import { authMode } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  resumeIfRunning();
  const s = getStore();
  const now = new Date();

  const contacts = s.contacts.map((c) => {
    const gate = canCallNow(c, s.settings, now);
    return { ...c, localTime: contactLocalTime(c), blockedReason: gate.allowed ? null : gate.reason };
  });

  const counts: Record<string, number> = {};
  for (const c of s.contacts) counts[c.status] = (counts[c.status] ?? 0) + 1;

  return ok({
    contacts,
    calls: s.calls.slice(0, 80),
    settings: s.settings,
    campaign: s.campaign,
    counts,
    signedIn: authMode(new URL(req.url).host) === "password",
    configured: {
      apiKey: Boolean(process.env.ELEVENLABS_API_KEY),
      agent: Boolean(s.settings.agentId),
      phone: Boolean(s.settings.phoneNumberId),
    },
  });
}
