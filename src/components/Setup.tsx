"use client";
import { useEffect, useRef, useState } from "react";
import type { Settings } from "@/lib/types";
import { api } from "./ui";

type SetupInfo = {
  hasApiKey: boolean; agentId: string; phoneNumberId: string;
  accountId: string; outboundNumber: string; hasToken: boolean;
  tier?: string; error?: string;
};
type Voice = { id: string; name: string; labels: Record<string, string> };

export function Setup({ settings, onChanged, notify, ephemeralReason }: {
  settings: Settings;
  onChanged: () => void;
  notify: (msg: string, bad?: boolean) => void;
  ephemeralReason: string | null;
}) {
  const [info, setInfo] = useState<SetupInfo | null>(null);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceId, setVoiceId] = useState("EXAVITQu4vr4xnSDxMaL");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState(settings);

  // /api/state re-polls every 1.5s and hands back a fresh object each time.
  // Only adopt it when the values actually changed, or it wipes what is being typed.
  const lastSeen = useRef(JSON.stringify(settings));
  useEffect(() => {
    const next = JSON.stringify(settings);
    if (next === lastSeen.current) return;
    lastSeen.current = next;
    setDraft(settings);
  }, [settings]);
  useEffect(() => {
    void api<SetupInfo>("/api/setup").then(setInfo).catch(() => {});
    void api<Voice[]>("/api/voices").then(setVoices).catch(() => {});
  }, []);

  async function run(action: string, body: Record<string, unknown>, msg: string) {
    setBusy(action);
    try {
      const r = await api<{ envPersisted?: boolean; envVar?: string }>("/api/setup", {
        method: "POST",
        body: JSON.stringify({ action, ...body }),
      });
      if (r.envPersisted === false && r.envVar) {
        notify(`${msg}. Save ${r.envVar} in the server settings so it survives a restart.`);
      } else notify(msg);
      setInfo(await api<SetupInfo>("/api/setup"));
      onChanged();
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), true);
    } finally {
      setBusy(null);
    }
  }

  async function saveSettings(patch: Partial<Settings>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    try {
      await api("/api/settings", { method: "PATCH", body: JSON.stringify(patch) });
      onChanged();
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), true);
      setDraft(settings);
    }
  }

  const agentReady = Boolean(settings.agentId);
  const phoneReady = Boolean(settings.phoneNumberId);

  return (
    <div className="pane">
      <div className="setup">
        {info?.tier === "free" && (
          <div className="notice notice--warn">
            <strong>This workspace is on a free voice plan</strong>
            <span>
              Everything here works and rehearses normally, but placing a real call may be refused until
              the plan is upgraded.
            </span>
          </div>
        )}

        {/* ---- 1. agent ---- */}
        <section className="step">
          <div className="step__head">
            <span className="step__n">01</span>
            <h2>The calling agent</h2>
            {agentReady && <span className="tag tag--good">ready</span>}
          </div>
          <p className="sec__hint">
            Builds the calling agent from the appointment script: it opens by saying it is an automated
            assistant, states the firm is not the IRS, refuses to take Social Security or payment details,
            and stops the moment someone asks to be removed. Save again after editing anything below to
            update what it says.
          </p>
          <div className="step__body">
            <div className="settings">
              <div className="setting">
                <label htmlFor="voice">Voice</label>
                <select id="voice" className="field" value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>
                  {voices.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}{v.labels.accent ? ` — ${v.labels.accent}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="setting">
                <label htmlFor="firm">Firm name</label>
                <input id="firm" className="field" value={draft.business.name}
                  onChange={(e) => setDraft({ ...draft, business: { ...draft.business, name: e.target.value } })}
                  onBlur={() => saveSettings({ business: draft.business })} />
              </div>
              <div className="setting">
                <label htmlFor="agentname">Agent&apos;s name on the call</label>
                <input id="agentname" className="field" value={draft.business.agentName}
                  onChange={(e) => setDraft({ ...draft, business: { ...draft.business, agentName: e.target.value } })}
                  onBlur={() => saveSettings({ business: draft.business })} />
              </div>
            </div>
            <div className="setting">
              <label htmlFor="slots">Consultation windows it may offer</label>
              <input id="slots" className="field" value={draft.business.slots}
                onChange={(e) => setDraft({ ...draft, business: { ...draft.business, slots: e.target.value } })}
                onBlur={() => saveSettings({ business: draft.business })} />
              <small>Written the way the agent should say them out loud.</small>
            </div>
            <div>
              <button className="btn btn--go btn--sm" disabled={busy === "agent"}
                onClick={() => run("agent", { voiceId }, agentReady ? "Agent script updated" : "Agent created")}>
                {busy === "agent" ? "Working…" : agentReady ? "Push script update" : "Create the agent"}
              </button>
              {agentReady && <span style={{ marginLeft: 10, fontSize: "0.75rem", color: "var(--text-3)" }}>Configured</span>}
            </div>
          </div>
        </section>

        <hr className="rule" />

        {/* ---- 2. phone ---- */}
        <section className="step">
          <div className="step__head">
            <span className="step__n">02</span>
            <h2>Outbound number</h2>
            {phoneReady && <span className="tag tag--good">ready</span>}
          </div>
          <p className="sec__hint">
            Connects the phone line the agent dials out on. The access token is used once to make the
            connection and is never stored.
          </p>
          <div className="step__body">
            <div className="settings">
              <div className="setting">
                <label>Account</label>
                <input className="field mono" readOnly value={info?.accountId || "not configured"} />
              </div>
              <div className="setting">
                <label>Number</label>
                <input className="field mono" readOnly value={info?.outboundNumber || "not configured"} />
              </div>
              <div className="setting">
                <label htmlFor="tok">Access token</label>
                <input id="tok" className="field" type="password" autoComplete="off" placeholder="paste it here"
                  value={token} onChange={(e) => setToken(e.target.value)} disabled={phoneReady} />
              </div>
            </div>
            <div>
              <button className="btn btn--go btn--sm"
                disabled={busy === "phone" || phoneReady || (!token && !info?.hasToken)}
                onClick={() => run("phone", { accessToken: token }, "Number connected").then(() => setToken(""))}>
                {busy === "phone" ? "Connecting…" : phoneReady ? "Connected" : "Connect the number"}
              </button>
              {phoneReady && <span style={{ marginLeft: 10, fontSize: "0.75rem", color: "var(--text-3)" }}>Connected</span>}
            </div>
          </div>
        </section>

        <hr className="rule" />

        {/* ---- 3. rules ---- */}
        <section className="step">
          <div className="step__head">
            <span className="step__n">03</span>
            <h2>Calling rules</h2>
          </div>
          <p className="sec__hint">
            The dialer checks every one of these before it places a call, and re-checks them on retries.
          </p>
          <div className="step__body">
            <div className="settings">
              <Num label="Lines at once" value={draft.maxConcurrent} min={1} max={10}
                onSave={(v) => saveSettings({ maxConcurrent: v })} hint="Calls running in parallel." />
              <Num label="Attempts per number" value={draft.maxAttempts} min={1} max={5}
                onSave={(v) => saveSettings({ maxAttempts: v })} hint="Including the first call." />
              <Num label="Wait between tries" value={draft.retryDelayMins} min={5} max={10080}
                onSave={(v) => saveSettings({ retryDelayMins: v })} hint="Minutes." />
              <Num label="Earliest hour" value={draft.callWindowStart} min={0} max={23}
                onSave={(v) => saveSettings({ callWindowStart: v })} hint="Their local time." />
              <Num label="Latest hour" value={draft.callWindowEnd} min={1} max={24}
                onSave={(v) => saveSettings({ callWindowEnd: v })} hint="Their local time, exclusive." />
            </div>

            <label className="switch">
              <input type="checkbox" checked={draft.requireConsent}
                onChange={(e) => saveSettings({ requireConsent: e.target.checked })} />
              <div>
                <strong>Only call numbers marked as consented</strong>
                <small>
                  Leave this on unless every number on the list has prior express written consent recorded
                  somewhere else. Numbers without it are held back and say so in the roster.
                </small>
              </div>
            </label>

            <label className="switch">
              <input type="checkbox" checked={draft.weekendCalling}
                onChange={(e) => saveSettings({ weekendCalling: e.target.checked })} />
              <div>
                <strong>Allow weekend calls</strong>
                <small>Off by default. Several states restrict or forbid Sunday telemarketing calls.</small>
              </div>
            </label>

            <label
              className="switch"
              style={
                ephemeralReason ? { opacity: 0.6 }
                : draft.dryRun ? undefined
                : { borderColor: "color-mix(in oklch, var(--stop) 45%, var(--line-soft))" }
              }
            >
              <input type="checkbox" checked={!draft.dryRun} disabled={Boolean(ephemeralReason)}
                onChange={(e) => saveSettings({ dryRun: !e.target.checked })} />
              <div>
                <strong>Place real calls</strong>
                <small>
                  {ephemeralReason ?? (
                    <>
                      Off means every call is simulated end to end — the queue, transcripts, and outcomes
                      all behave normally, nothing dials. Turn it on only when you mean it.
                    </>
                  )}
                </small>
              </div>
            </label>
          </div>
        </section>

        {info?.error && <div className="notice notice--warn"><strong>Voice service</strong><span>{info.error}</span></div>}
      </div>
    </div>
  );
}

function Num({ label, value, min, max, hint, onSave }: {
  label: string; value: number; min: number; max: number; hint?: string; onSave: (v: number) => void;
}) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  return (
    <div className="setting">
      <label>{label}</label>
      <input className="field mono" type="number" min={min} max={max} value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => { const n = Number(v); if (Number.isFinite(n) && n >= min && n <= max) onSave(n); else setV(String(value)); }} />
      {hint && <small>{hint}</small>}
    </div>
  );
}
