import { normalizePhone, timezoneForPhone } from "./phone";
import { newId } from "./store";
import type { Contact } from "./types";

export type ImportRow = { ok: true; contact: Contact } | { ok: false; line: string; reason: string };

/** Split a CSV line, honouring quoted fields. */
function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === "," || ch === "\t" || ch === ";") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const HEADER_ALIASES: Record<string, string> = {
  phone: "phone", "phone number": "phone", number: "phone", mobile: "phone", cell: "phone", tel: "phone",
  telephone: "phone", "phone_number": "phone",
  name: "name", "full name": "name", "full_name": "name", contact: "name", "first name": "name",
  "first_name": "name", client: "name",
  company: "company", business: "company", org: "company", organization: "company",
  email: "email", "e-mail": "email", "email address": "email",
  consent: "consent", "opted in": "consent", "opt in": "consent", "opt_in": "consent", "opted_in": "consent",
  dnc: "dnc", "do not call": "dnc", "do_not_call": "dnc",
  notes: "notes", note: "notes", comment: "notes",
};

function isTruthy(v: string | undefined): boolean {
  if (!v) return false;
  return ["1", "y", "yes", "true", "t", "x"].includes(v.trim().toLowerCase());
}

/**
 * Accepts CSV/TSV with or without a header row, and also a plain list of
 * numbers one per line. Anything unparseable is reported, never silently dropped.
 */
function reasonFor(cell: string): string {
  const p = normalizePhone(cell);
  return p.ok ? "" : p.reason;
}

export function parseContacts(text: string, opts: { defaultConsent: boolean }): ImportRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];

  let header: string[] | null = null;
  const first = splitCsv(lines[0]).map((h) => h.toLowerCase());
  const mapped = first.map((h) => HEADER_ALIASES[h]);
  const looksLikeHeader = mapped.filter(Boolean).length >= 1 && !/\d{7}/.test(lines[0]);
  if (looksLikeHeader) header = mapped.map((m, i) => m ?? first[i]);

  const rows: ImportRow[] = [];
  const seen = new Set<string>();

  for (const line of lines.slice(looksLikeHeader ? 1 : 0)) {
    const cells = splitCsv(line);
    const rec: Record<string, string> = {};

    if (header) {
      header.forEach((key, i) => { if (key && cells[i] !== undefined) rec[key] = cells[i]; });
    }
    // A header row does not stop someone pasting bare numbers underneath it, so
    // fall back to sniffing the columns whenever the mapped phone cell is unusable.
    if (!normalizePhone(rec.phone ?? "").ok) {
      const phoneIdx = cells.findIndex((c) => normalizePhone(c).ok);
      if (phoneIdx === -1) {
        rows.push({ ok: false, line, reason: cells.length === 1 ? normalizePhone(cells[0]).ok ? "" : reasonFor(cells[0]) : "no phone number in row" });
        continue;
      }
      rec.phone = cells[phoneIdx];
      // A bare number pasted under a header lands in the name column; don't keep it as a name.
      if (rec.name && normalizePhone(rec.name).ok) rec.name = "";
      if (!rec.name) rec.name = cells.filter((_, i) => i !== phoneIdx).join(" ").trim();
    }

    const parsed = normalizePhone(rec.phone ?? "");
    if (!parsed.ok) { rows.push({ ok: false, line, reason: parsed.reason }); continue; }
    if (seen.has(parsed.e164)) { rows.push({ ok: false, line, reason: "duplicate in this import" }); continue; }
    seen.add(parsed.e164);

    rows.push({
      ok: true,
      contact: {
        id: newId("ct"),
        name: rec.name || "",
        phone: parsed.e164,
        raw: rec.phone ?? "",
        company: rec.company || undefined,
        email: rec.email || undefined,
        timezone: timezoneForPhone(parsed.e164),
        consent: header && "consent" in rec ? isTruthy(rec.consent) : opts.defaultConsent,
        dnc: isTruthy(rec.dnc),
        status: "pending",
        attempts: 0,
        notes: rec.notes || undefined,
        createdAt: Date.now(),
      },
    });
  }
  return rows;
}
