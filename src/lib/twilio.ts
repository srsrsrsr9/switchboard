/**
 * Hanging up a call that is already on its way.
 *
 * The voice service places calls but offers nothing to take one back, so
 * stopping a call that is already ringing means going to the carrier directly.
 * The call SID recorded when the call was placed is the handle for that.
 */

const SID = () => process.env.TWILIO_ACCOUNT_SID ?? "";
const TOKEN = () => process.env.TWILIO_AUTH_TOKEN ?? "";

/** Whether this deployment can hang up at all. Without it, Stop cannot reach a ringing phone. */
export function canHangUp(): boolean {
  return Boolean(SID() && TOKEN());
}

export async function hangUp(callSid: string): Promise<void> {
  if (!canHangUp()) throw new Error("The phone line credentials needed to hang up are not configured.");

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${SID()}/Calls/${encodeURIComponent(callSid)}.json`,
    {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${SID()}:${TOKEN()}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      // "completed" ends a call that has been answered and cancels one still ringing.
      body: new URLSearchParams({ Status: "completed" }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!res.ok) {
    throw new Error(`The carrier would not hang up the call (HTTP ${res.status}).`);
  }
}
