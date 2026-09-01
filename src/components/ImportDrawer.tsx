"use client";
import { useRef, useState } from "react";
import { api } from "./ui";

type Result = { added: number; skipped: { line: string; reason: string }[]; total: number };

export function ImportDrawer({ onDone, onError }: { onDone: (msg: string) => void; onError: (msg: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function readFile(file: File) {
    const content = await file.text();
    setText((prev) => (prev.trim() ? `${prev.trim()}\n${content}` : content));
    setOpen(true);
  }

  async function submit() {
    setBusy(true);
    try {
      const r = await api<Result>("/api/contacts", {
        method: "POST",
        body: JSON.stringify({ text, defaultConsent: consent }),
      });
      setResult(r);
      setText("");
      onDone(`${r.added} number${r.added === 1 ? "" : "s"} loaded`);
      if (!r.skipped.length) setOpen(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="drawer" data-open={open}>
      <button className="drawer__head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span>
          <span className="eyebrow">Load numbers</span>
          <span style={{ display: "block", fontSize: "0.78rem", color: "var(--text-3)", marginTop: 2 }}>
            Paste a list, or drop a CSV. Header row optional.
          </span>
        </span>
        <span className="mono" style={{ color: "var(--text-3)" }}>{open ? "close" : "open"}</span>
      </button>

      <div className="drawer__body">
        <div>
          <div className="drawer__inner">
            <div
              className="dropzone"
              data-drag={dragging}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const f = e.dataTransfer.files?.[0];
                if (f) void readFile(f);
              }}
            >
              <textarea
                className="field"
                rows={7}
                spellCheck={false}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={"name,phone,company,consent\nDana Whitfield,(616) 555-0134,Whitfield Dental,yes\n616-555-0188\n+1 313 555 0142"}
              />
            </div>

            <div style={{ display: "flex", gap: "var(--space-sm)", alignItems: "center", flexWrap: "wrap" }}>
              <button className="btn btn--go btn--sm" onClick={submit} disabled={busy || !text.trim()}>
                {busy ? "Loading…" : "Add to roster"}
              </button>
              <button className="btn btn--sm" onClick={() => fileRef.current?.click()} disabled={busy}>
                Choose a file
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.tsv,.txt"
                hidden
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void readFile(f); e.target.value = ""; }}
              />
              <label className="importnote" style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ accentColor: "var(--lamp)" }} />
                These numbers have consent on file
              </label>
            </div>

            {result && result.skipped.length > 0 && (
              <div className="notice notice--warn">
                <strong>{result.skipped.length} row{result.skipped.length === 1 ? "" : "s"} skipped</strong>
                <div className="skiplist">
                  {result.skipped.slice(0, 40).map((s, i) => (
                    <div className="skiprow" key={i}>
                      <span className="mono" style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{s.line}</span>
                      <span>{s.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
