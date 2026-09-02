import { ensureStore } from "@/lib/store";
import { startCampaign, stopCampaign } from "@/lib/dialer";
import { ok, bad, errorMessage } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  await ensureStore();
  try {
    const { action } = (await req.json()) as { action?: string };
    if (action === "start") {
      const r = startCampaign();
      return r.ok ? ok({ running: true }) : bad(r.error ?? "Could not start.");
    }
    if (action === "stop") { stopCampaign(); return ok({ running: false }); }
    return bad("Unknown action.");
  } catch (err) {
    return bad(errorMessage(err), 500);
  }
}
