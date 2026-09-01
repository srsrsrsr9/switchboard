import * as el from "@/lib/elevenlabs";
import { ok, bad, errorMessage } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const voices = await el.listVoices();
    return ok(voices.map((v) => ({ id: v.voice_id, name: v.name, labels: v.labels ?? {} })));
  } catch (err) {
    return bad(errorMessage(err), 502);
  }
}
