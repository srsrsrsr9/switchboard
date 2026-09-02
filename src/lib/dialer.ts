import { ensureStore, getStore, persist, newId, storeLoadError } from "./store";
import { canCallNow } from "./compliance";
import { storageIsDurable } from "./storage";
import * as el from "./elevenlabs";
import { openingLine } from "./script";
import type { Call, Contact, ContactStatus, Store } from "./types";

const TICK_MS = 2500;

type G = typeof globalThis & { __callerDialer?: { timer: NodeJS.Timeout | null; ticking: boolean } };
const g = globalThis as G;
const engine = (g.__callerDialer ||= { timer: null, ticking: false });

export function startCampaign(): { ok: boolean; error?: string } {
  const s = getStore();
  if (!s.settings.dryRun) {
    if (!s.settings.agentId) return { ok: false, error: "No agent configured. Finish setup first." };
    if (!s.settings.phoneNumberId) return { ok: false, error: "No outbound number configured. Finish setup first." };
  }
  s.campaign = { running: true, startedAt: Date.now(), lastError: undefined };
  persist();
  ensureTimer();
  void tick();
  return { ok: true };
}

export function stopCampaign(): void {
  const s = getStore();
  s.campaign.running = false;
  s.campaign.stoppedAt = Date.now();
  persist();
}

function ensureTimer() {
  if (engine.timer) return;
  engine.timer = setInterval(() => { void tick(); }, TICK_MS);
  // Never hold the process open just for the dialer loop.
  (engine.timer as unknown as { unref?: () => void }).unref?.();
}

/** Re-arm the loop after a dev-server reload if a campaign was left running. */
export function resumeIfRunning() {
  if (getStore().campaign.running) ensureTimer();
}

async function tick() {
  if (engine.ticking) return;
  engine.ticking = true;
  try {
    const s = await ensureStore();
    s.campaign.lastTickAt = Date.now();
    await refreshActiveCalls(s);
    if (s.campaign.running) await dialNext(s);
    persist();
  } catch (err) {
    const s = getStore();
    s.campaign.lastError = err instanceof Error ? err.message : String(err);
    persist();
    console.error("[dialer] tick failed:", err);
  } finally {
    engine.ticking = false;
  }
}

const ACTIVE: Call["status"][] = ["dialing", "in_progress", "processing"];

function activeCalls(s: Store): Call[] {
  return s.calls.filter((c) => ACTIVE.includes(c.status));
}

async function dialNext(s: Store) {
  const inFlight = activeCalls(s).length;
  const room = s.settings.maxConcurrent - inFlight;
  if (room <= 0) return;

  const now = new Date();
  const busy = new Set(activeCalls(s).map((c) => c.contactId));
  const queue: Contact[] = [];

  for (const c of s.contacts) {
    if (queue.length >= room) break;
    if (busy.has(c.id)) continue;
    if (!["pending", "queued", "callback", "no_answer"].includes(c.status)) continue;
    const gate = canCallNow(c, s.settings, now);
    if (!gate.allowed) {
      // The reason is recomputed for the UI on every /api/state read, so don't
      // stamp it over lastOutcome — that would bury the real result of the last call.
      if (gate.retryAt) c.nextAttemptAt = gate.retryAt;
      continue;
    }
    queue.push(c);
  }

  for (const contact of queue) await placeCall(s, contact);
}

async function placeCall(s: Store, contact: Contact) {
  const call: Call = {
    id: newId("call"),
    contactId: contact.id,
    contactName: contact.name,
    phone: contact.phone,
    status: "dialing",
    startedAt: Date.now(),
    transcript: [],
    simulated: s.settings.dryRun,
  };
  s.calls.unshift(call);
  contact.status = "calling";
  contact.attempts += 1;
  contact.lastAttemptAt = Date.now();
  persist();

  // storageIsDurable is re-checked here rather than trusted from settings: this is
  // the last point before a real phone rings.
  if (s.settings.dryRun || !storageIsDurable() || storeLoadError()) { simulate(call, contact); return; }

  try {
    const res = await el.outboundCall({
      agentId: s.settings.agentId,
      phoneNumberId: s.settings.phoneNumberId,
      toNumber: contact.phone,
      dynamicVariables: {
        contact_name: contact.name || "there",
        company: contact.company || "",
      },
      firstMessage: openingLine(contact.name),
    });
    if (!res.success || !res.conversation_id) {
      failCall(call, contact, res.message || "The call could not be placed");
      return;
    }
    call.conversationId = res.conversation_id;
    call.callSid = res.callSid || undefined;
    call.status = "in_progress";
  } catch (err) {
    failCall(call, contact, err instanceof Error ? err.message : String(err));
  }
  persist();
}

function failCall(call: Call, contact: Contact, error: string) {
  call.status = "failed";
  call.error = error;
  call.endedAt = Date.now();
  call.outcome = "failed";
  contact.status = "failed";
  contact.lastOutcome = error;
  persist();
}

async function refreshActiveCalls(s: Store) {
  for (const call of activeCalls(s)) {
    if (call.simulated) { advanceSimulation(s, call); continue; }
    if (!call.conversationId) continue;
    try {
      const conv = await el.getConversation(call.conversationId);
      applyConversation(s, call, conv);
    } catch (err) {
      // A conversation can 404 for a few seconds right after it is created.
      if (Date.now() - call.startedAt > 90_000) {
        const contact = s.contacts.find((c) => c.id === call.contactId);
        if (contact) failCall(call, contact, err instanceof Error ? err.message : String(err));
      }
    }
  }
}

function applyConversation(s: Store, call: Call, conv: el.ConversationDetail) {
  call.transcript = (conv.transcript ?? [])
    .filter((t) => t.message)
    .map((t) => ({ role: t.role, message: String(t.message), timeInCallSecs: t.time_in_call_secs }));
  call.durationSecs = conv.metadata?.call_duration_secs;

  const status = conv.status ?? "";
  if (status === "initiated") call.status = "in_progress";
  else if (status === "in-progress") call.status = "in_progress";
  else if (status === "processing") call.status = "processing";
  else if (status === "done" || status === "failed") {
    const collected = flattenCollected(conv);
    call.collected = collected;
    call.endedAt = Date.now();
    call.status = "done";
    finish(s, call, collected, conv);
  }
}

function flattenCollected(conv: el.ConversationDetail): Record<string, unknown> {
  const raw = conv.analysis?.data_collection_results ?? {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) out[k] = v?.value;
  if (conv.analysis?.transcript_summary && !out.summary) out.summary = conv.analysis.transcript_summary;
  return out;
}

/** Turn the post-call analysis into a contact status the operator can act on. */
function finish(s: Store, call: Call, data: Record<string, unknown>, conv?: el.ConversationDetail) {
  const contact = s.contacts.find((c) => c.id === call.contactId);
  if (!contact) return;

  const truthy = (v: unknown) => v === true || v === "true" || v === "True";
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

  if (truthy(data.do_not_call)) {
    contact.dnc = true;
    contact.status = "dnc";
    contact.lastOutcome = "Asked not to be contacted again";
    call.outcome = "opted out";
  } else if (truthy(data.appointment_booked)) {
    contact.status = "booked";
    contact.lastOutcome = `Booked ${str(data.appointment_time) ?? "(time not captured)"}`;
    contact.email = str(data.contact_email) ?? contact.email;
    call.outcome = "booked";
    call.appointment = {
      when: str(data.appointment_time),
      email: str(data.contact_email),
      notes: str(data.summary),
    };
  } else if (truthy(data.callback_requested)) {
    contact.status = "callback";
    contact.lastOutcome = `Callback requested: ${str(data.callback_time) ?? "time not given"}`;
    contact.nextAttemptAt = Date.now() + s.settings.retryDelayMins * 60_000;
    call.outcome = "callback";
  } else if (data.reached_human !== undefined && !truthy(data.reached_human)) {
    contact.status = contact.attempts >= s.settings.maxAttempts ? "no_answer" : "queued";
    contact.lastOutcome = "No live answer";
    contact.nextAttemptAt = Date.now() + s.settings.retryDelayMins * 60_000;
    call.outcome = "no answer";
  } else {
    contact.status = "declined";
    contact.lastOutcome = str(data.summary) ?? "Not interested";
    call.outcome = "declined";
  }

  const evals = conv?.analysis?.evaluation_criteria_results;
  if (evals) {
    const failures = Object.entries(evals)
      .filter(([, v]) => v?.result === "failure")
      .map(([k]) => k);
    if (failures.length) call.error = `Compliance check failed: ${failures.join(", ")}`;
  }
}

/* ------------------------------------------------------------------ */
/* Dry-run simulation: exercises the whole pipeline without dialing.    */
/* ------------------------------------------------------------------ */

type SimPlan = { endsAt: number; turns: { at: number; role: string; message: string }[]; data: Record<string, unknown> };
const sims = new Map<string, SimPlan>();

function simulate(call: Call, contact: Contact) {
  const name = contact.name || "there";
  const roll = Math.random();
  const t0 = Date.now();
  const line = (sec: number, role: string, message: string) => ({ at: t0 + sec * 1000, role, message });

  const open = [
    line(1, "agent", `Hi, this is Avery — I'm an automated assistant calling from Meridian Tax Resolution. We're a private tax representation firm, not the IRS. Am I speaking with ${name}?`),
  ];

  let plan: SimPlan;
  if (roll < 0.18) {
    plan = { endsAt: t0 + 22_000, data: { reached_human: false, summary: "Voicemail — short message left." },
      turns: [...open, line(6, "agent", "Left a voicemail with the callback number.")] };
  } else if (roll < 0.45) {
    plan = { endsAt: t0 + 46_000, data: { reached_human: true, has_irs_matter: true, appointment_booked: true,
      appointment_time: "Wednesday at 2:00 PM Eastern", contact_email: "sim@example.com",
      summary: "Has a 2023 correspondence audit, booked a consult for Wednesday 2pm." },
      turns: [...open,
        line(5, "user", "Yes, this is them."),
        line(8, "agent", "Thanks. Have you received a letter or notice from the IRS recently?"),
        line(13, "user", "Yeah, a CP2000 for 2023."),
        line(17, "agent", "Understood. I can get you twenty minutes with one of our enrolled agents. Would Tuesday at ten or Wednesday at two work better?"),
        line(24, "user", "Wednesday at two."),
        line(27, "agent", "Wednesday at two o'clock Eastern, booked. What's the best email for the confirmation?"),
        line(34, "user", "sim at example dot com."),
        line(40, "agent", "Perfect. An enrolled agent will call you at this number Wednesday at two. Thanks for your time."),
      ] };
  } else if (roll < 0.62) {
    plan = { endsAt: t0 + 20_000, data: { reached_human: true, callback_requested: true,
      callback_time: "after 6pm", summary: "Busy, asked for a callback this evening." },
      turns: [...open, line(5, "user", "I'm in the middle of something."),
        line(9, "agent", "No problem at all — when would be a better time?"),
        line(13, "user", "After six."), line(16, "agent", "I'll try you after six. Thanks.")] };
  } else if (roll < 0.76) {
    plan = { endsAt: t0 + 16_000, data: { reached_human: true, do_not_call: true,
      summary: "Asked to be removed from the list." },
      turns: [...open, line(5, "user", "Take me off your list."),
        line(8, "agent", "Of course — I'll remove you and you won't hear from us again. Sorry to bother you.")] };
  } else if (roll < 0.88) {
    plan = { endsAt: t0 + 18_000, data: { reached_human: true, has_irs_matter: false,
      summary: "No IRS matter, not a fit." },
      turns: [...open, line(5, "user", "Speaking."),
        line(9, "agent", "Have you received any notice from the IRS, or been told an audit is coming?"),
        line(14, "user", "No, nothing like that."),
        line(17, "agent", "Then I won't take up your time — we won't call again about this. Have a good day.")] };
  } else {
    plan = { endsAt: t0 + 9_000, data: { reached_human: false, summary: "Rang out, no answer." }, turns: [] };
  }

  sims.set(call.id, plan);
  call.status = "in_progress";
  persist();
}

function advanceSimulation(s: Store, call: Call) {
  const plan = sims.get(call.id);
  if (!plan) { call.status = "done"; call.endedAt = Date.now(); return; }
  const now = Date.now();
  call.transcript = plan.turns
    .filter((t) => t.at <= now)
    .map((t) => ({ role: t.role, message: t.message, timeInCallSecs: Math.round((t.at - call.startedAt) / 1000) }));
  if (now >= plan.endsAt) {
    call.status = "done";
    call.endedAt = now;
    call.durationSecs = Math.round((plan.endsAt - call.startedAt) / 1000);
    call.collected = plan.data;
    sims.delete(call.id);
    finish(s, call, plan.data);
  }
}

export const _statusOrder: ContactStatus[] = [
  "calling", "queued", "pending", "callback", "booked", "declined", "no_answer", "failed", "dnc",
];
