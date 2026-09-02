"use client";
import { useState } from "react";
import { api, StatePayload } from "./ui";

type Posture = StatePayload["posture"];

/**
 * On a deployment that runs relaxed, the schedule gates are off by default and
 * an operator switches the full rules back on for a while. This is the inverse
 * of the override control, which suits a console being demonstrated rather than
 * run as a campaign.
 */
export function PostureControl({ posture, onChanged, notify }: {
  posture: Posture;
  onChanged: () => void;
  notify: (msg: string, bad?: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function enforce(minutes: number) {
    setBusy(true);
    try {
      await api("/api/enforce", { method: "POST", body: JSON.stringify({ minutes }) });
      notify(`Full calling rules on for ${minutes} minutes`);
      onChanged();
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), true);
    } finally {
      setBusy(false);
    }
  }

  async function relax() {
    setBusy(true);
    try {
      await api("/api/enforce", { method: "DELETE" });
      notify("Back to relaxed");
      onChanged();
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), true);
    } finally {
      setBusy(false);
    }
  }

  if (posture.enforcing) {
    return (
      <button className="btn btn--sm ov-btn ov-btn--on" onClick={relax} disabled={busy}
        title="Go back to the relaxed demo posture">
        Rules on · {fmt(posture.enforceRemainingMs)} left
      </button>
    );
  }

  return (
    <button className="btn btn--sm ov-btn" onClick={() => enforce(60)} disabled={busy}
      title="Apply calling hours, weekend, and consent rules for one hour">
      Enforce rules · 1h
    </button>
  );
}

/** Always-on strip, so nobody forgets which posture this console is in. */
export function PostureBanner({ posture }: { posture: Posture }) {
  if (posture.enforcing) {
    return (
      <div className="ovbanner">
        <span className="lamp lamp--good" aria-hidden />
        <span>
          <strong>Full calling rules on</strong> — local calling hours, weekend block, and the consent
          requirement all apply for the next {fmt(posture.enforceRemainingMs)}.
        </span>
      </div>
    );
  }
  return (
    <div className="ovbanner">
      <span className="lamp lamp--held" aria-hidden />
      <span>
        <strong>Demo posture</strong> — calling hours, weekends, and the consent requirement are off so
        a call can be placed at any time. Do-not-call suppression still applies.
      </span>
    </div>
  );
}

function fmt(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}
