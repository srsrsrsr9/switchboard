export function ok<T>(data: T) {
  return Response.json(data, { headers: { "cache-control": "no-store" } });
}
export function bad(message: string, status = 400) {
  return Response.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
}
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
