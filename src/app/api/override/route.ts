import { ensureStore, getStore, persist } from "@/lib/store";
import { activeOverride } from "@/lib/compliance";
import { ok, bad, errorMessage } from "@/lib/api";
import type { Override } from "@/lib/types";

export const dynamic = "force-dynamic";

const MAX_MINUTES = 1440; // 24 hours; long enough for a demo day, short enough to expire on its own

export async function POST(req: Request) {
  await ensureStore();
  try {
    const body = (await req.json()) as {
      minutes?: number; callingHours?: boolean; weekends?: boolean; consent?: boolean; note?: string;
    };

    const minutes = Number(body.minutes);
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > MAX_MINUTES) {
      return bad(`Duration must be between 1 and ${MAX_MINUTES} minutes.`);
    }
    const callingHours = Boolean(body.callingHours);
    const weekends = Boolean(body.weekends);
    const consent = Boolean(body.consent);
    if (!callingHours && !weekends && !consent) {
      return bad("Pick at least one rule to relax.");
    }

    const s = getStore();
    const override: Override = {
      until: Date.now() + minutes * 60_000,
      setAt: Date.now(),
      callingHours, weekends, consent,
      note: typeof body.note === "string" ? body.note.slice(0, 200) : undefined,
    };
    s.settings.override = override;
    persist();

    // Overrides are a compliance-relevant action, so leave a trace in the logs
    // even though the console itself only shows the live state.
    console.warn(
      `[override] rules relaxed for ${minutes}m — ` +
      `callingHours=${callingHours} weekends=${weekends} consent=${consent}` +
      (override.note ? ` note=${JSON.stringify(override.note)}` : ""),
    );
    return ok({ override });
  } catch (err) {
    return bad(errorMessage(err), 500);
  }
}

export async function DELETE() {
  await ensureStore();
  const s = getStore();
  s.settings.override = null;
  persist();
  console.warn("[override] cleared by operator");
  return ok({ override: null });
}

export async function GET() {
  await ensureStore();
  const s = getStore();
  return ok({ override: activeOverride(s.settings) });
}
