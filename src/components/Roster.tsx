"use client";
import { useMemo, useState } from "react";
import { api, ContactRow, formatPhoneDisplay, Lamp, relative, statusMeta } from "./ui";
import { ImportDrawer } from "./ImportDrawer";

type Props = {
  contacts: ContactRow[];
  requireConsent: boolean;
  onChanged: () => void;
  notify: (msg: string, bad?: boolean) => void;
};

const FILTERS = [
  { id: "all", label: "Everyone" },
  { id: "callable", label: "Ready" },
  { id: "blocked", label: "Held back" },
  { id: "done", label: "Finished" },
] as const;

export function Roster({ contacts, requireConsent, onChanged, notify }: Props) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contacts.filter((c) => {
      if (q && !(`${c.name} ${c.phone} ${c.company ?? ""}`.toLowerCase().includes(q))) return false;
      if (filter === "callable") return !c.blockedReason && ["pending", "queued", "callback", "no_answer"].includes(c.status);
      if (filter === "blocked") return Boolean(c.blockedReason);
      if (filter === "done") return ["booked", "declined", "dnc", "failed"].includes(c.status);
      return true;
    });
  }, [contacts, filter, query]);

  async function patch(id: string, body: Record<string, unknown>) {
    try {
      await api("/api/contacts", { method: "PATCH", body: JSON.stringify({ id, ...body }) });
      onChanged();
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), true);
    }
  }

  async function remove(id: string) {
    try {
      await api("/api/contacts", { method: "DELETE", body: JSON.stringify({ id }) });
      onChanged();
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), true);
    }
  }

  return (
    <>
      <div className="pane" style={{ paddingBottom: 0 }}>
        <ImportDrawer onDone={(m) => { notify(m); onChanged(); }} onError={(m) => notify(m, true)} />
      </div>

      {contacts.length === 0 ? (
        <div className="empty">
          <h3>No numbers on the board yet</h3>
          <p>
            Open <strong>Load numbers</strong> above and paste a list. One number per line works, and so
            does a CSV with any of these columns: <code>name</code>, <code>phone</code>, <code>company</code>,{" "}
            <code>email</code>, <code>consent</code>, <code>dnc</code>, <code>notes</code>.
          </p>
          <p>
            Numbers are normalised to E.164 and matched to a timezone by area code, so the dialer can keep
            every call inside that person&apos;s local calling hours.
          </p>
        </div>
      ) : (
        <>
          <div className="pane" style={{ paddingBottom: "var(--space-sm)", display: "flex", gap: "var(--space-sm)", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 2 }}>
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  className="btn btn--ghost btn--sm"
                  style={filter === f.id ? { background: "var(--panel-2)", color: "var(--text)" } : undefined}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <input
              className="field"
              style={{ maxWidth: 220, marginLeft: "auto" }}
              placeholder="Find a name or number"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <table className="roster">
            <thead>
              <tr>
                <th style={{ width: "30%" }}>Contact</th>
                <th style={{ width: 130 }}>Number</th>
                <th style={{ width: 92 }}>Their time</th>
                <th>Status</th>
                <th style={{ width: 54 }}>Tries</th>
                <th style={{ width: 150 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const meta = statusMeta(c.status);
                return (
                  <tr key={c.id} data-active={c.status === "calling"}>
                    <td>
                      <div className="who">
                        <span className={c.name ? "who__name" : "who__name who__name--unknown"}>
                          {c.name || "Unnamed"}
                        </span>
                        <span className="who__meta">
                          {c.company || (requireConsent && !c.consent ? "no consent recorded" : c.timezone.split("/")[1]?.replace("_", " "))}
                        </span>
                      </div>
                    </td>
                    <td className="mono">{formatPhoneDisplay(c.phone)}</td>
                    <td className="mono" style={{ color: "var(--text-3)" }}>{c.localTime}</td>
                    <td>
                      <div className="state">
                        <Lamp tone={meta.tone} />
                        <span>{meta.label}</span>
                      </div>
                      {(c.blockedReason || c.lastOutcome) && (
                        <div className="state__why">{c.blockedReason ?? c.lastOutcome}</div>
                      )}
                    </td>
                    <td className="attempt">{c.attempts || "—"}</td>
                    <td>
                      <div className="rowacts">
                        {!c.dnc && (
                          <button className="btn btn--ghost btn--sm" onClick={() => patch(c.id, { dnc: true })} title="Add to do-not-call">
                            Suppress
                          </button>
                        )}
                        {!c.consent && requireConsent && (
                          <button className="btn btn--ghost btn--sm" onClick={() => patch(c.id, { consent: true })}>
                            Mark consented
                          </button>
                        )}
                        {["declined", "no_answer", "failed"].includes(c.status) && (
                          <button className="btn btn--ghost btn--sm" onClick={() => patch(c.id, { requeue: true })}>
                            Requeue
                          </button>
                        )}
                        <button className="btn btn--ghost btn--sm" onClick={() => remove(c.id)} title="Remove from roster">
                          ✕
                        </button>
                      </div>
                      {c.lastAttemptAt && !c.blockedReason && (
                        <div className="attempt" style={{ textAlign: "right" }}>{relative(c.lastAttemptAt)}</div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && (
            <div className="empty"><p>Nothing matches that filter.</p></div>
          )}
        </>
      )}
    </>
  );
}
