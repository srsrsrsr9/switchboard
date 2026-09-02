import { ensureStore, getStore, persist } from "@/lib/store";
import { isEnforcing } from "@/lib/compliance";
import { ok, bad, errorMessage } from "@/lib/api";

export const dynamic = "force-dynamic";

const MAX_MINUTES = 1440;

/** Turn the full rules back on for a while, on a deployment that runs relaxed. */
export async function POST(req: Request) {
  await ensureStore();
  try {
    const { minutes } = (await req.json().catch(() => ({}))) as { minutes?: number };
    const m = Number(minutes ?? 60);
    if (!Number.isFinite(m) || m < 1 || m > MAX_MINUTES) {
      return bad(`Duration must be between 1 and ${MAX_MINUTES} minutes.`);
    }
    const s = getStore();
    s.settings.enforceUntil = Date.now() + m * 60_000;
    persist();
    console.warn(`[enforce] full calling rules switched on for ${m}m`);
    return ok({ enforceUntil: s.settings.enforceUntil });
  } catch (err) {
    return bad(errorMessage(err), 500);
  }
}

export async function DELETE() {
  await ensureStore();
  const s = getStore();
  s.settings.enforceUntil = null;
  persist();
  console.warn("[enforce] back to relaxed");
  return ok({ enforceUntil: null });
}

export async function GET() {
  await ensureStore();
  const s = getStore();
  return ok({ enforcing: isEnforcing(s.settings), enforceUntil: s.settings.enforceUntil });
}
