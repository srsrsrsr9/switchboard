export function ok<T>(data: T) {
  return Response.json(data, { headers: { "cache-control": "no-store" } });
}
export function bad(message: string, status = 400) {
  return Response.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
}
/**
 * Messages from upstream services surface in the operator UI, and the UI is
 * shown to people outside the team. Strip vendor and infrastructure names so a
 * failure reads as a failure, not as a stack disclosure.
 */
export function scrub(message: string): string {
  return message
    .replace(/\bELEVENLABS_[A-Z_]+\b/g, "the voice service credentials")
    .replace(/\bTWILIO_[A-Z_]+\b/g, "the phone line settings")
    .replace(/\belevenlabs?\b/gi, "the voice service")
    .replace(/\btwilio\b/gi, "the phone line")
    .replace(/\.env\.local\b/g, "the server settings")
    .trim();
}

export function errorMessage(err: unknown): string {
  return scrub(err instanceof Error ? err.message : String(err));
}
