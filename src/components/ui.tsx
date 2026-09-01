"use client";
import type { Call, Contact, ContactStatus } from "@/lib/types";

export type ContactRow = Contact & { localTime: string; blockedReason: string | null };

export type StatePayload = {
  contacts: ContactRow[];
  calls: Call[];
  settings: import("@/lib/types").Settings;
  campaign: import("@/lib/types").CampaignState;
  counts: Record<string, number>;
  signedIn: boolean;
  durableStorage: boolean;
  ephemeralReason: string | null;
  configured: { apiKey: boolean; agent: boolean; phone: boolean };
};

type LampTone = "off" | "wait" | "live" | "good" | "bad" | "held";

const STATUS: Record<ContactStatus, { label: string; tone: LampTone }> = {
  pending:   { label: "Not called", tone: "off" },
  queued:    { label: "Queued",     tone: "wait" },
  calling:   { label: "On the line", tone: "live" },
  booked:    { label: "Booked",     tone: "good" },
  callback:  { label: "Call back",  tone: "held" },
  declined:  { label: "Declined",   tone: "off" },
  no_answer: { label: "No answer",  tone: "off" },
  failed:    { label: "Failed",     tone: "bad" },
  dnc:       { label: "Do not call", tone: "bad" },
};

export function statusMeta(s: ContactStatus) {
  return STATUS[s] ?? { label: s, tone: "off" as LampTone };
}

export function Lamp({ tone }: { tone: LampTone }) {
  return <span className={`lamp lamp--${tone}`} aria-hidden />;
}

export function formatPhoneDisplay(e164: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `${m[1]} ${m[2]} ${m[3]}` : e164;
}

export function clock(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function relative(ts?: number): string {
  if (!ts) return "";
  const d = Math.round((Date.now() - ts) / 1000);
  if (d < 45) return "just now";
  if (d < 3600) return `${Math.round(d / 60)}m ago`;
  if (d < 86400) return `${Math.round(d / 3600)}h ago`;
  return `${Math.round(d / 86400)}d ago`;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers as Record<string, string>) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error || `Request failed (${res.status})`);
  return body as T;
}
