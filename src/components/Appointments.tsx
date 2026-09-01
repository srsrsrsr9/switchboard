"use client";
import type { Call } from "@/lib/types";
import { ContactRow, formatPhoneDisplay, relative } from "./ui";

export function Appointments({ calls, contacts }: { calls: Call[]; contacts: ContactRow[] }) {
  const booked = calls.filter((c) => c.outcome === "booked");

  if (!booked.length) {
    return (
      <div className="empty">
        <h3>No consultations booked yet</h3>
        <p>
          When the agent gets someone to agree to a specific day and time, it lands here with the
          transcript summary and whatever email they gave.
        </p>
      </div>
    );
  }

  return (
    <div className="pane">
      <div className="sec">
        <div className="sec__title">
          <h2>Booked consultations</h2>
          <span className="mono" style={{ color: "var(--text-3)" }}>{booked.length}</span>
        </div>
        <button className="btn btn--sm" onClick={() => exportCsv(booked, contacts)}>Export CSV</button>
      </div>

      <div className="appts">
        {booked.map((c) => {
          const contact = contacts.find((x) => x.id === c.contactId);
          return (
            <div className="appt" key={c.id}>
              <div>
                <div className="appt__when">{c.appointment?.when ?? "Time not captured"}</div>
                <div className="appt__who">
                  {c.contactName || "Unnamed"} · <span className="mono">{formatPhoneDisplay(c.phone)}</span>
                  {c.appointment?.email && <> · {c.appointment.email}</>}
                </div>
                {c.appointment?.notes && <p className="appt__notes">{c.appointment.notes}</p>}
                {contact?.company && <p className="appt__notes">{contact.company}</p>}
              </div>
              <div style={{ textAlign: "right", display: "grid", gap: 4 }}>
                <span className="mono" style={{ fontSize: "0.7rem", color: "var(--text-3)" }}>
                  {relative(c.endedAt)}
                </span>
                {c.simulated && <span className="tag">simulated</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function exportCsv(calls: Call[], contacts: ContactRow[]) {
  const esc = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = ["name", "phone", "email", "company", "appointment", "notes", "booked_at", "simulated"];
  const lines = [header.join(",")];
  for (const c of calls) {
    const contact = contacts.find((x) => x.id === c.contactId);
    lines.push([
      esc(c.contactName), esc(c.phone), esc(c.appointment?.email ?? ""), esc(contact?.company ?? ""),
      esc(c.appointment?.when ?? ""), esc(c.appointment?.notes ?? ""),
      esc(c.endedAt ? new Date(c.endedAt).toISOString() : ""), esc(c.simulated ? "yes" : "no"),
    ].join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `appointments-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
