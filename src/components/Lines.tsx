"use client";
import { useEffect, useRef, useState } from "react";
import type { Call } from "@/lib/types";
import { clock, formatPhoneDisplay, Lamp, relative } from "./ui";

const OUTCOME_TONE: Record<string, "good" | "bad" | "held" | "off"> = {
  booked: "good", "opted out": "bad", failed: "bad", callback: "held",
  "no answer": "off", declined: "off",
};

export function Lines({ calls }: { calls: Call[] }) {
  const active = calls.filter((c) => c.status === "dialing" || c.status === "in_progress" || c.status === "processing");
  const past = calls.filter((c) => !active.includes(c));

  return (
    <div className="lines">
      <div className="lines__head">
        <div className="sec__title">
          <h2>Lines</h2>
          <span className="mono" style={{ color: "var(--text-3)" }}>
            {active.length} up
          </span>
        </div>
      </div>

      <div className="lines__scroll">
        {calls.length === 0 && (
          <div className="empty" style={{ padding: "var(--space-xl) var(--space-md)" }}>
            <h3>Nothing on the wire</h3>
            <p>
              Live calls appear here as they connect, with the transcript filling in turn by turn.
              Start the campaign once you have numbers loaded.
            </p>
          </div>
        )}
        {active.map((c) => <CallCard key={c.id} call={c} defaultOpen />)}
        {past.length > 0 && active.length > 0 && <hr className="rule" />}
        {past.map((c) => <CallCard key={c.id} call={c} />)}
      </div>
    </div>
  );
}

function CallCard({ call, defaultOpen = false }: { call: Call; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const live = call.status === "dialing" || call.status === "in_progress";
  const [, setNow] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setNow((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [live]);

  useEffect(() => {
    if (open && live) scrollRef.current?.scrollIntoView({ block: "nearest" });
  }, [call.transcript.length, open, live]);

  const elapsed = call.durationSecs ?? Math.round(((call.endedAt ?? Date.now()) - call.startedAt) / 1000);
  const tone = live ? "live" : call.status === "failed" ? "bad" : OUTCOME_TONE[call.outcome ?? ""] ?? "off";

  return (
    <div className="callcard" data-open={open}>
      <button className="callcard__head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Lamp tone={tone} />
        <span style={{ minWidth: 0 }}>
          <span className="callcard__name" style={{ display: "block" }}>
            {call.contactName || formatPhoneDisplay(call.phone)}
          </span>
          <span className="callcard__sub">
            {live
              ? call.status === "dialing" ? "dialing…" : "connected"
              : `${call.outcome ?? call.status} · ${relative(call.endedAt ?? call.startedAt)}`}
          </span>
        </span>
        <span className="callcard__timer">{clock(elapsed)}</span>
      </button>

      <div className="callcard__body">
        <div>
          {call.error && (
            <div className="outcome" style={{ borderColor: "color-mix(in oklch, var(--stop) 45%, var(--line-soft))" }}>
              {call.error}
            </div>
          )}
          {call.appointment?.when && (
            <div className="outcome" style={{ borderColor: "color-mix(in oklch, var(--live) 40%, var(--line-soft))" }}>
              <Lamp tone="good" />
              <span>Booked {call.appointment.when}{call.appointment.email ? ` · ${call.appointment.email}` : ""}</span>
            </div>
          )}
          <div className="transcript">
            {call.transcript.length === 0 && (
              <p style={{ fontSize: "0.78rem", color: "var(--text-3)" }}>
                {live ? "Waiting for the first turn…" : "No transcript was captured for this call."}
              </p>
            )}
            {call.transcript.map((t, i) => (
              <div className={`turn turn--${t.role === "agent" ? "agent" : "user"}`} key={i}>
                <span className="turn__who">{t.role === "agent" ? "Agent" : "Them"}</span>
                <span className="turn__text">{t.message}</span>
              </div>
            ))}
            <div ref={scrollRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
