"use client";
import { useEffect, useRef, useState } from "react";
import { api, StatePayload } from "./ui";

type Live = StatePayload["override"];

const DURATIONS = [30, 60, 120, 240] as const;

export function OverrideControl({ live, onChanged, notify }: {
  live: Live;
  onChanged: () => void;
  notify: (msg: string, bad?: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [callingHours, setCallingHours] = useState(true);
  const [weekends, setWeekends] = useState(false);
  const [consent, setConsent] = useState(false);
  const [minutes, setMinutes] = useState<number>(60);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  async function apply() {
    setBusy(true);
    try {
      await api("/api/override", {
        method: "POST",
        body: JSON.stringify({ minutes, callingHours, weekends, consent }),
      });
      notify(`Rules relaxed for ${minutes} minutes`);
      setOpen(false);
      onChanged();
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), true);
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    try {
      await api("/api/override", { method: "DELETE" });
      notify("Back to normal rules");
      onChanged();
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ovwrap" ref={box}>
      <button
        className={live ? "btn btn--sm ov-btn ov-btn--on" : "btn btn--sm ov-btn"}
        onClick={() => (live ? void clear() : setOpen((o) => !o))}
        disabled={busy}
        aria-expanded={open}
        title={live ? "Cancel the override and go back to normal rules" : "Temporarily relax the schedule rules"}
      >
        {live ? `Relaxed · ${fmt(live.remainingMs)} left` : "Relax rules"}
      </button>

      {open && !live && (
        <div className="ovpanel">
          <p className="eyebrow">Relax for</p>
          <div className="ovdur">
            {DURATIONS.map((d) => (
              <button
                key={d}
                className="btn btn--sm"
                style={minutes === d ? { background: "var(--panel-3)", borderColor: "var(--lamp-dim)" } : undefined}
                onClick={() => setMinutes(d)}
              >
                {d < 60 ? `${d}m` : `${d / 60}h`}
              </button>
            ))}
          </div>

          <p className="eyebrow" style={{ marginTop: "var(--space-sm)" }}>What to lift</p>
          <Check label="Calling hours" checked={callingHours} onChange={setCallingHours}
            hint="Ignore the local-time window for the duration." />
          <Check label="Weekend block" checked={weekends} onChange={setWeekends}
            hint="Allow Saturday and Sunday calls." />
          <Check label="Consent requirement" checked={consent} onChange={setConsent}
            hint="Dial numbers with no consent flag recorded." />

          <p className="ovnote">
            Federal rules limit consumer solicitation calls to 8:00–21:00 in the called party&apos;s local
            time. Lifting calling hours can put you outside that, and lifting the consent requirement
            puts the TCPA basis on you. Both are logged.
          </p>
          <p className="ovnote ovnote--hard">
            Do-not-call suppression and the attempt cap are never lifted, by this or anything else.
          </p>

          <div className="ovactions">
            <button className="btn btn--ghost btn--sm" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn btn--go btn--sm" onClick={apply} disabled={busy}>
              {busy ? "Applying…" : "Relax rules"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Check({ label, checked, onChange, hint }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; hint: string;
}) {
  return (
    <label className="ovcheck">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <strong>{label}</strong>
        <small>{hint}</small>
      </span>
    </label>
  );
}

function fmt(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${m}m`;
}

/** The strip under the masthead while an override is live. */
export function OverrideBanner({ live, onClear }: { live: NonNullable<Live>; onClear: () => void }) {
  const lifted = [
    live.callingHours && "calling hours",
    live.weekends && "weekend block",
    live.consent && "consent requirement",
  ].filter(Boolean).join(", ");

  return (
    <div className="ovbanner">
      <span className="lamp lamp--held" aria-hidden />
      <span>
        <strong>Rules relaxed</strong> — {lifted} lifted for the next {fmt(live.remainingMs)}.
        Do-not-call suppression still applies.
      </span>
      <button className="btn btn--sm btn--stop" onClick={onClear}>Restore rules</button>
    </div>
  );
}
