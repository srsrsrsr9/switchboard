"use client";
import { useState } from "react";

export default function Login() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not sign in.");
        return;
      }
      window.location.href = "/";
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell" style={{ display: "grid", placeItems: "center" }}>
      <form onSubmit={submit} style={{ display: "grid", gap: "var(--space-md)", width: "min(360px, 88vw)" }}>
        <div>
          <span className="brand__mark" style={{ fontSize: "1.25rem" }}>Switchboard</span>
          <p style={{ color: "var(--text-3)", fontSize: "0.8125rem", marginTop: 6 }}>
            This console places live phone calls. Sign in to use it.
          </p>
        </div>
        <input
          className="field"
          type="password"
          autoFocus
          autoComplete="current-password"
          placeholder="Operator password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className="btn btn--go" type="submit" disabled={busy || !password}>
          {busy ? "Checking…" : "Sign in"}
        </button>
        {error && <div className="notice notice--warn">{error}</div>}
      </form>
    </div>
  );
}
