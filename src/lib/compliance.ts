import { localTimeAt } from "./phone";
import type { Contact, Settings } from "./types";

export type Gate = { allowed: boolean; reason?: string; retryAt?: number };

const WEEKEND = new Set(["Sat", "Sun"]);

/**
 * Every call passes through here first. A blocked contact is either skipped
 * permanently (DNC, no consent, attempts exhausted) or deferred with a retryAt.
 */
export function canCallNow(c: Contact, s: Settings, now = new Date()): Gate {
  if (c.dnc) return { allowed: false, reason: "On do-not-call list" };
  if (s.requireConsent && !c.consent) return { allowed: false, reason: "No consent on file" };
  if (c.attempts >= s.maxAttempts) return { allowed: false, reason: `Reached ${s.maxAttempts}-attempt limit` };
  if (c.nextAttemptAt && c.nextAttemptAt > now.getTime()) {
    return { allowed: false, reason: "Waiting for retry window", retryAt: c.nextAttemptAt };
  }

  const t = localTimeAt(c.timezone, now);
  if (!s.weekendCalling && WEEKEND.has(t.weekday)) {
    return { allowed: false, reason: `Weekend where they are (${t.label})`, retryAt: nextOpen(c, s, now) };
  }
  if (t.hour < s.callWindowStart || t.hour >= s.callWindowEnd) {
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
