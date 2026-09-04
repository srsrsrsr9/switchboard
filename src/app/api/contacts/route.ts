import { ensureStore, getStore, persist } from "@/lib/store";
import { parseContacts } from "@/lib/import";
import { ok, bad, errorMessage } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  await ensureStore();
  try {
    const { text, defaultConsent } = (await req.json()) as { text?: string; defaultConsent?: boolean };
    if (!text || !text.trim()) return bad("Nothing to import.");

    const s = getStore();
    const existing = new Set(s.contacts.map((c) => c.phone));
    const rows = parseContacts(text, { defaultConsent: Boolean(defaultConsent) });

    let added = 0;
    const skipped: { line: string; reason: string }[] = [];
    for (const r of rows) {
      if (!r.ok) { skipped.push({ line: r.line, reason: r.reason }); continue; }
      if (existing.has(r.contact.phone)) {
        skipped.push({ line: r.contact.raw, reason: "already in the list" });
        continue;
      }
      existing.add(r.contact.phone);
      s.contacts.push(r.contact);
      added++;
    }
    persist();
    return ok({ added, skipped, total: s.contacts.length });
  } catch (err) {
    return bad(errorMessage(err), 500);
  }
}

export async function PATCH(req: Request) {
  await ensureStore();
  try {
    const { id, ...patch } = (await req.json()) as Record<string, unknown> & { id?: string };
    const s = getStore();
    const c = s.contacts.find((x) => x.id === id);
    if (!c) return bad("No such contact.", 404);

    if (typeof patch.dnc === "boolean") { c.dnc = patch.dnc; if (patch.dnc) c.status = "dnc"; else if (c.status === "dnc") c.status = "pending"; }
    if (typeof patch.consent === "boolean") c.consent = patch.consent;
    if (typeof patch.name === "string") c.name = patch.name;
    if (typeof patch.notes === "string") c.notes = patch.notes;
    if (patch.requeue === true) {
      c.status = "pending"; c.attempts = 0; c.nextAttemptAt = undefined; c.lastOutcome = undefined;
    }
    persist();
    return ok(c);
  } catch (err) {
    return bad(errorMessage(err), 500);
  }
}

export async function DELETE(req: Request) {
  await ensureStore();
  try {
    const { id, all } = (await req.json()) as { id?: string; all?: boolean };
    const s = getStore();
    if (all) { s.contacts = []; s.calls = []; persist(); return ok({ cleared: true }); }
    const i = s.contacts.findIndex((x) => x.id === id);
    if (i === -1) return bad("No such contact.", 404);
    s.contacts.splice(i, 1);
    // Drop this contact's calls too. An in-flight call left behind here holds a
    // concurrency slot with no contact to resolve it against, which stalls the
    // dialer; the clear-everything branch above already works this way.
    s.calls = s.calls.filter((c) => c.contactId !== id);
    persist();
    return ok({ removed: id });
  } catch (err) {
    return bad(errorMessage(err), 500);
  }
}
