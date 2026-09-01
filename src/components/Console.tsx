"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, StatePayload } from "./ui";
import { Roster } from "./Roster";
import { Lines } from "./Lines";
import { Appointments } from "./Appointments";
import { Setup } from "./Setup";

type Tab = "roster" | "appointments" | "setup";

export function Console() {
  const [state, setState] = useState<StatePayload | null>(null);
  const [tab, setTab] = useState<Tab>("roster");
  const [toast, setToast] = useState<{ msg: string; bad?: boolean } | null>(null);
  const [pending, setPending] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((msg: string, bad?: boolean) => {
    setToast({ msg, bad });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), bad ? 6000 : 2600);
  }, []);

  const refresh = useCallback(async () => {
    try {
      setState(await api<StatePayload>("/api/state"));
    } catch {
      /* the poll will try again shortly */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 1500);
    return () => clearInterval(t);
  }, [refresh]);

  async function toggleCampaign() {
    if (!state) return;
    setPending(true);
    try {
      const action = state.campaign.running ? "stop" : "start";
      await api("/api/campaign", { method: "POST", body: JSON.stringify({ action }) });
      notify(action === "start" ? "Campaign running" : "Campaign stopped");
      await refresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), true);
    } finally {
      setPending(false);
    }
  }

  if (!state) {
    return (
      <div className="shell">
        <div className="empty" style={{ margin: "auto" }}><p>Connecting to the board…</p></div>
      </div>
    );
  }

  const { counts, campaign, settings, contacts, calls } = state;
  const live = calls.filter((c) => c.status === "dialing" || c.status === "in_progress").length;
  const ready = contacts.filter((c) => !c.blockedReason && ["pending", "queued", "callback", "no_answer"].includes(c.status)).length;
  const canStart = contacts.length > 0 && (ready > 0 || campaign.running);

  return (
    <div className="shell">
      <header className="masthead">
        <div className="brand">
          <span className="brand__mark">Switchboard</span>
          <span className="brand__sub">{settings.business.name}</span>
        </div>

        <div className="runbar">
          <button
            className={campaign.running ? "btn btn--stop" : "btn btn--go"}
            onClick={toggleCampaign}
            disabled={pending || (!campaign.running && !canStart)}
            title={
              campaign.running || canStart
                ? undefined
                : contacts.length === 0
                  ? "Load some numbers first"
                  : "Every number is held back — check the reasons in the roster"
            }
          >
            {campaign.running ? "Stop calling" : "Start calling"}
          </button>
          <div className={campaign.running ? "runstate runstate--on" : "runstate"}>
            <span className={`lamp lamp--${campaign.running ? "live" : "off"}`} aria-hidden />
            {campaign.running ? `${live} on the line` : "Idle"}
          </div>
          <div className="counters">
            <Counter n={ready} label="ready" />
            <Counter n={counts.booked ?? 0} label="booked" tone="var(--live)" />
            <Counter n={counts.dnc ?? 0} label="opted out" tone="oklch(0.78 0.11 27)" />
            <Counter n={contacts.length} label="total" />
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)" }}>
          <span className={settings.dryRun ? "mode mode--sim" : "mode mode--live"}>
            {settings.dryRun ? "Simulation" : "Live dialing"}
          </span>
          {state.signedIn && (
            <button
              className="btn btn--ghost btn--sm"
              onClick={async () => {
                await fetch("/api/login", { method: "DELETE" });
                window.location.href = "/login";
              }}
            >
              Sign out
            </button>
          )}
        </div>
      </header>

      {campaign.lastError && (
        <div className="notice notice--warn" style={{ margin: "var(--space-md) var(--space-lg) 0", borderRadius: "var(--radius)" }}>
          <strong>The dialer hit an error</strong>
          <span>{campaign.lastError}</span>
        </div>
      )}

      <div className="main">
        <div className="column">
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === "roster"} className="tab" onClick={() => setTab("roster")}>
              Roster<span className="tab__count">{contacts.length}</span>
            </button>
            <button role="tab" aria-selected={tab === "appointments"} className="tab" onClick={() => setTab("appointments")}>
              Appointments<span className="tab__count">{counts.booked ?? 0}</span>
            </button>
            <button role="tab" aria-selected={tab === "setup"} className="tab" onClick={() => setTab("setup")}>
              Setup
              {(!state.configured.agent || !state.configured.phone) && (
                <span className="tab__count" style={{ color: "var(--lamp)" }}>!</span>
              )}
            </button>
          </div>

          {tab === "roster" && (
            <Roster contacts={contacts} requireConsent={settings.requireConsent} onChanged={refresh} notify={notify} />
          )}
          {tab === "appointments" && <Appointments calls={calls} contacts={contacts} />}
          {tab === "setup" && <Setup settings={settings} onChanged={refresh} notify={notify} />}
        </div>

        <div className="column column--right">
          <Lines calls={calls} dryRun={settings.dryRun} />
        </div>
      </div>

      {toast && <div className={toast.bad ? "toast toast--bad" : "toast"}>{toast.msg}</div>}
    </div>
  );
}

function Counter({ n, label, tone }: { n: number; label: string; tone?: string }) {
  return (
    <div className="counter">
      <span className="counter__n" style={tone && n > 0 ? { color: tone } : undefined}>{n}</span>
      <span className="counter__l">{label}</span>
    </div>
  );
}
