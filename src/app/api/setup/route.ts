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
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
    twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER ?? "",
    hasTwilioToken: Boolean(process.env.TWILIO_AUTH_TOKEN),
  };
  try {
    out.tier = (await el.whoami()).tier;
    out.phoneNumbers = await el.listPhoneNumbers();
  } catch (err) {
    out.error = errorMessage(err);
  }
  return ok(out);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { action?: string; voiceId?: string; twilioAuthToken?: string; label?: string };
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
      return ok({ agentId, created: true, envPersisted, envVar: "ELEVENLABS_AGENT_ID" });
    }

    if (body.action === "phone") {
      // The Twilio auth token is used for this one request and never stored.
      const token = body.twilioAuthToken?.trim() || process.env.TWILIO_AUTH_TOKEN;
      const sid = process.env.TWILIO_ACCOUNT_SID;
      const number = process.env.TWILIO_PHONE_NUMBER;
      if (!sid) return bad("TWILIO_ACCOUNT_SID is missing from .env.local.");
      if (!number) return bad("TWILIO_PHONE_NUMBER is missing from .env.local.");
      if (!token) return bad("Paste your Twilio Auth Token to import the number.");

      const existing = await el.listPhoneNumbers();
      const already = existing.find((p) => p.phone_number === number);
      if (already) {
        s.settings.phoneNumberId = already.phone_number_id;
        s.settings.fromNumber = number;
        persist();
        const envPersisted = writeEnv({ ELEVENLABS_PHONE_NUMBER_ID: already.phone_number_id });
        return ok({ phoneNumberId: already.phone_number_id, reused: true, envPersisted, envVar: "ELEVENLABS_PHONE_NUMBER_ID" });
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
      return ok({ phoneNumberId, created: true, envPersisted, envVar: "ELEVENLABS_PHONE_NUMBER_ID" });
    }

    return bad("Unknown setup action.");
  } catch (err) {
    return bad(errorMessage(err), 502);
  }
}
