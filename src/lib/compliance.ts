import { localTimeAt } from "./phone";
import type { Contact, Override, Settings } from "./types";

export type Gate = { allowed: boolean; reason?: string; retryAt?: number };

const WEEKEND = new Set(["Sat", "Sun"]);

/** The override, or null once it has expired. Expiry is checked on every read. */
export function activeOverride(s: Settings, now = Date.now()): Override | null {
  const o = s.override;
  if (!o || o.until <= now) return null;
  return o;
}

/** True while a manual enforcement window is running. */
export function isEnforcing(s: Settings, now = Date.now()): boolean {
  return Boolean(s.enforceUntil && s.enforceUntil > now);
}

/**
 * Whether the schedule gates are currently off. Two ways that happens: the
 * deployment runs relaxed by default and nobody has switched enforcement on,
 * or an operator set a temporary override. Do-not-call and the attempt cap are
 * outside this entirely and apply in every case.
 */
function relaxations(s: Settings, now: number): { callingHours: boolean; weekends: boolean; consent: boolean } {
  if (s.relaxedByDefault && !isEnforcing(s, now)) {
    return { callingHours: true, weekends: true, consent: true };
  }
  const ov = activeOverride(s, now);
  return {
    callingHours: Boolean(ov?.callingHours),
    weekends: Boolean(ov?.weekends),
    consent: Boolean(ov?.consent),
  };
}

/**
 * Every call passes through here first. A blocked contact is either skipped
 * permanently (DNC, no consent, attempts exhausted) or deferred with a retryAt.
 */
export function canCallNow(c: Contact, s: Settings, now = new Date()): Gate {
  const ov = relaxations(s, now.getTime());

  // Neither of these is relaxable, by design. Relaxing shifts *when* a call may
  // go out, never whether someone who opted out can be called.
  if (c.dnc) return { allowed: false, reason: "On do-not-call list" };
  if (c.attempts >= s.maxAttempts) return { allowed: false, reason: `Reached ${s.maxAttempts}-attempt limit` };

  if (s.requireConsent && !c.consent && !ov?.consent) {
    return { allowed: false, reason: "No consent on file" };
  }
  if (c.nextAttemptAt && c.nextAttemptAt > now.getTime()) {
    return { allowed: false, reason: "Waiting for retry window", retryAt: c.nextAttemptAt };
  }

  const t = localTimeAt(c.timezone, now);
  if (!s.weekendCalling && !ov?.weekends && WEEKEND.has(t.weekday)) {
    return { allowed: false, reason: `Weekend where they are (${t.label})`, retryAt: nextOpen(c, s, now) };
  }
  if (!ov?.callingHours && (t.hour < s.callWindowStart || t.hour >= s.callWindowEnd)) {
    return {
      allowed: false,
      reason: `Outside ${s.callWindowStart}:00-${s.callWindowEnd}:00 local time (${t.label} for them)`,
      retryAt: nextOpen(c, s, now),
    };
  }
  return { allowed: true };
}

/** Timestamp of the next minute this contact becomes callable. Coarse but safe. */
function nextOpen(c: Contact, s: Settings, now: Date): number {
  for (let i = 1; i <= 24 * 7; i++) {
    const t = new Date(now.getTime() + i * 3600_000);
    const local = localTimeAt(c.timezone, t);
    if (!s.weekendCalling && WEEKEND.has(local.weekday)) continue;
    if (local.hour >= s.callWindowStart && local.hour < s.callWindowEnd) return t.getTime();
  }
  return now.getTime() + 3600_000;
}

/** Human-readable current local time for a contact, for the UI. */
export function contactLocalTime(c: Contact): string {
  return localTimeAt(c.timezone).label;
}
