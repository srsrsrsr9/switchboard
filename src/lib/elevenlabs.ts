import { buildPrompt, buildFirstMessage, DATA_COLLECTION, EVALUATION_CRITERIA } from "./script";
import type { Settings } from "./types";

const BASE = "https://api.elevenlabs.io/v1";

export class ElevenLabsError extends Error {
  constructor(message: string, readonly status: number, readonly body: unknown) {
    super(message);
  }
}

function apiKey(): string {
  const k = process.env.ELEVENLABS_API_KEY;
  if (!k) throw new ElevenLabsError("The voice service is not configured on this server.", 0, null);
  return k;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      "xi-api-key": apiKey(),
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
    cache: "no-store",
    // Without a deadline a hung request never settles, and because the dialer
    // awaits these inside its tick the whole loop would stop advancing — no
    // calls placed, no calls closed out, and no way back short of a restart.
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  let body: unknown = text;
  try { body = text ? JSON.parse(text) : null; } catch { /* leave as text */ }
  if (!res.ok) {
    throw new ElevenLabsError(describeError(res.status, body), res.status, body);
  }
  return body as T;
}

function describeError(status: number, body: unknown): string {
  const detail = (body as { detail?: unknown })?.detail;
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object") {
    const d = detail as { message?: string; status?: string };
    if (d.message) return d.message;
    if (d.status) return d.status;
  }
  if (Array.isArray(detail) && detail.length) {
    const first = detail[0] as { msg?: string; loc?: string[] };
    return `${(first.loc || []).join(".")}: ${first.msg ?? "invalid"}`;
  }
  return `The voice service returned an error (HTTP ${status}).`;
}

export async function whoami(): Promise<{ tier: string }> {
  const sub = await call<{ tier: string }>("/user/subscription");
  return { tier: sub.tier };
}

export type VoiceSummary = { voice_id: string; name: string; labels?: Record<string, string> };
export async function listVoices(): Promise<VoiceSummary[]> {
  // /v2/voices sits outside the /v1 base path, so it is fetched directly.
  const res = await fetch("https://api.elevenlabs.io/v2/voices?page_size=60", {
    headers: { "xi-api-key": apiKey() },
    cache: "no-store",
  });
  if (!res.ok) throw new ElevenLabsError(`Could not load the voice list (HTTP ${res.status}).`, res.status, null);
  const body = (await res.json()) as { voices?: VoiceSummary[] };
  return body.voices ?? [];
}

function agentBody(s: Settings, voiceId: string) {
  return {
    name: `${s.business.name} — audit consult booker`,
    conversation_config: {
      agent: {
        prompt: {
          prompt: buildPrompt(s),
          llm: "gemini-2.5-flash",
          temperature: 0.3,
        },
        first_message: buildFirstMessage(s),
        language: "en",
        dynamic_variables: {
          dynamic_variable_placeholders: { contact_name: "there", company: "" },
        },
      },
      tts: {
        voice_id: voiceId,
        // turbo reads with more expression than flash; the extra latency is
        // well under the pause a person leaves before answering anyway.
        model_id: "eleven_turbo_v2",
        // Lower stability lets the delivery move; too high and every sentence
        // lands on the same note, which is the giveaway on a phone call.
        stability: 0.35,
        similarity_boost: 0.75,
        speed: 1.02,
        optimize_streaming_latency: 3,
      },
      turn: {
        // Short, so it comes back quickly rather than leaving dead air.
        turn_timeout: 6,
        silence_end_call_timeout: 20,
      },
      conversation: { max_duration_seconds: 240 },
    },
    platform_settings: {
      data_collection: DATA_COLLECTION,
      evaluation: { criteria: EVALUATION_CRITERIA },
      // The opening line is chosen per call, so it has to be overridable.
      overrides: {
        conversation_config_override: { agent: { first_message: true } },
      },
    },
  };
}

export async function createAgent(s: Settings, voiceId: string): Promise<string> {
  const r = await call<{ agent_id: string }>("/convai/agents/create", {
    method: "POST",
    body: JSON.stringify(agentBody(s, voiceId)),
  });
  return r.agent_id;
}

export async function updateAgent(agentId: string, s: Settings, voiceId: string): Promise<void> {
  await call(`/convai/agents/${agentId}`, { method: "PATCH", body: JSON.stringify(agentBody(s, voiceId)) });
}

export async function getAgent(agentId: string): Promise<Record<string, unknown>> {
  return call(`/convai/agents/${agentId}`);
}

export type PhoneNumber = { phone_number_id: string; phone_number: string; label?: string; provider?: string };
export async function listPhoneNumbers(): Promise<PhoneNumber[]> {
  return call<PhoneNumber[]>("/convai/phone-numbers");
}

export async function importTwilioNumber(args: {
  phoneNumber: string; label: string; sid: string; token: string;
}): Promise<string> {
  const r = await call<{ phone_number_id: string }>("/convai/phone-numbers", {
    method: "POST",
    body: JSON.stringify({
      provider: "twilio",
      phone_number: args.phoneNumber,
      label: args.label,
      sid: args.sid,
      token: args.token,
    }),
  });
  return r.phone_number_id;
}

export type OutboundResult = {
  success: boolean; message?: string; conversation_id?: string | null; callSid?: string | null;
};

export async function outboundCall(args: {
  agentId: string; phoneNumberId: string; toNumber: string;
  dynamicVariables: Record<string, string>;
  firstMessage?: string;
}): Promise<OutboundResult> {
  return call<OutboundResult>("/convai/twilio/outbound-call", {
    method: "POST",
    body: JSON.stringify({
      agent_id: args.agentId,
      agent_phone_number_id: args.phoneNumberId,
      to_number: args.toNumber,
      conversation_initiation_client_data: {
        dynamic_variables: args.dynamicVariables,
        ...(args.firstMessage
          ? { conversation_config_override: { agent: { first_message: args.firstMessage } } }
          : {}),
      },
      telephony_call_config: { ringing_timeout_secs: 35 },
    }),
  });
}

export type ConversationDetail = {
  status?: string;
  transcript?: { role: string; message: string | null; time_in_call_secs?: number }[];
  metadata?: { call_duration_secs?: number; start_time_unix_secs?: number; termination_reason?: string };
  analysis?: {
    call_successful?: string;
    transcript_summary?: string;
    data_collection_results?: Record<string, { value?: unknown; rationale?: string }>;
    evaluation_criteria_results?: Record<string, { result?: string; rationale?: string }>;
  };
};

export async function getConversation(conversationId: string): Promise<ConversationDetail> {
  return call<ConversationDetail>(`/convai/conversations/${conversationId}`);
}
