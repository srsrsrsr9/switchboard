import { ensureStore, getStore, persist } from "@/lib/store";
import { ok, bad, errorMessage } from "@/lib/api";
import { EPHEMERAL_REASON, storageIsDurable } from "@/lib/storage";

export const dynamic = "force-dynamic";

const NUMERIC: Record<string, [number, number]> = {
  maxConcurrent: [1, 10],
  maxAttempts: [1, 5],
  retryDelayMins: [5, 10080],
  callWindowStart: [0, 23],
  callWindowEnd: [1, 24],
};

export async function PATCH(req: Request) {
  await ensureStore();
  try {
    const patch = (await req.json()) as Record<string, unknown>;
    const s = getStore();

    for (const [key, [lo, hi]] of Object.entries(NUMERIC)) {
      if (key in patch) {
        const n = Number(patch[key]);
        if (!Number.isFinite(n) || n < lo || n > hi) return bad(`${key} must be between ${lo} and ${hi}.`);
        (s.settings as unknown as Record<string, number>)[key] = Math.round(n);
      }
    }
    if (s.settings.callWindowEnd <= s.settings.callWindowStart) {
      return bad("The calling window has to end after it starts.");
    }
    if (patch.dryRun === false && !storageIsDurable()) return bad(EPHEMERAL_REASON, 409);
    for (const key of ["weekendCalling", "requireConsent", "dryRun"] as const) {
      if (typeof patch[key] === "boolean") s.settings[key] = patch[key] as boolean;
    }
    if (patch.business && typeof patch.business === "object") {
      s.settings.business = { ...s.settings.business, ...(patch.business as Record<string, string>) };
    }
    persist();
    return ok(s.settings);
  } catch (err) {
    return bad(errorMessage(err), 500);
  }
}
