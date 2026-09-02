import { getStore, persist } from "@/lib/store";
import * as el from "@/lib/elevenlabs";
import { writeEnv } from "@/lib/env-file";
import { ok, bad, errorMessage } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = getStore();
  const out: Record<string, unknown> = {
    hasApiKey: Boolean(process.env.ELEVENLABS_API_KEY),
    agentId: s.settings.agentId,
    phoneNumberId: s.settings.phoneNumberId,
    // Deliberately neutral field names: this payload is visible in devtools and
    // the console gets demoed to people outside the team.
    accountId: process.env.TWILIO_ACCOUNT_SID ?? "",
    outboundNumber: process.env.TWILIO_PHONE_NUMBER ?? "",
    hasToken: Boolean(process.env.TWILIO_AUTH_TOKEN),
  };
  try {
    out.tier = (await el.whoami()).tier;
    out.numbers = await el.listPhoneNumbers();
  } catch (err) {
    out.error = errorMessage(err);
  }
  return ok(out);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { action?: string; voiceId?: string; accessToken?: string; label?: string };
    const s = getStore();

    if (body.action === "agent") {
      const voiceId = body.voiceId || "EXAVITQu4vr4xnSDxMaL";
      if (s.settings.agentId) {
        await el.updateAgent(s.settings.agentId, s.settings, voiceId);
        return ok({ agentId: s.settings.agentId, updated: true });
      }
      const agentId = await el.createAgent(s.settings, voiceId);
      s.settings.agentId = agentId;
      persist();
      const envPersisted = writeEnv({ ELEVENLABS_AGENT_ID: agentId });
      return ok({ agentId, created: true, envPersisted, envVar: "the agent id" });
    }

    if (body.action === "phone") {
      // The access token is used for this one request and never stored.
      const token = body.accessToken?.trim() || process.env.TWILIO_AUTH_TOKEN;
      const sid = process.env.TWILIO_ACCOUNT_SID;
      const number = process.env.TWILIO_PHONE_NUMBER;
      if (!sid) return bad("The phone line account is not configured on this server.");
      if (!number) return bad("No outbound number is configured on this server.");
      if (!token) return bad("Paste your access token to connect the number.");

      // Diagnostic only: shape, never the value. A Twilio auth token is 32 hex
      // characters, so a mismatch here means the field is not receiving what the
      // operator thinks they pasted (autofill, truncation, wrong panel).
      console.warn(
        `[setup] token received: length=${token.length} ` +
        `looksLikeAuthToken=${/^[0-9a-f]{32}$/.test(token)} ` +
        `startsWith=${token.slice(0, 2)} endsWith=${token.slice(-2)}`,
      );

      const existing = await el.listPhoneNumbers();
      const already = existing.find((p) => p.phone_number === number);
      if (already) {
        s.settings.phoneNumberId = already.phone_number_id;
        s.settings.fromNumber = number;
        persist();
        const envPersisted = writeEnv({ ELEVENLABS_PHONE_NUMBER_ID: already.phone_number_id });
        return ok({ phoneNumberId: already.phone_number_id, reused: true, envPersisted, envVar: "the number id" });
      }

      const phoneNumberId = await el.importTwilioNumber({
        phoneNumber: number,
        label: body.label?.trim() || "Caller outbound",
        sid,
        token,
      });
      s.settings.phoneNumberId = phoneNumberId;
      s.settings.fromNumber = number;
      persist();
      const envPersisted = writeEnv({ ELEVENLABS_PHONE_NUMBER_ID: phoneNumberId });
      return ok({ phoneNumberId, created: true, envPersisted, envVar: "the number id" });
    }

    return bad("Unknown setup action.");
  } catch (err) {
    return bad(errorMessage(err), 502);
  }
}
