import fs from "node:fs";
import path from "node:path";

/**
 * Where the store actually lives.
 *
 * Locally that is a file. On an ephemeral host it must be something that
 * outlives the container, because the store holds the do-not-call list. When
 * Upstash credentials are present we use their REST API — plain HTTPS, so no
 * driver and no connection pool to manage in a serverless-ish environment.
 */

const REST_URL = () => process.env.UPSTASH_REDIS_REST_URL?.replace(/\/+$/, "") ?? "";
const REST_TOKEN = () => process.env.UPSTASH_REDIS_REST_TOKEN ?? "";
const KEY = process.env.STORE_KEY || "switchboard:store";

export function backendKind(): "redis" | "file" {
  return REST_URL() && REST_TOKEN() ? "redis" : "file";
}

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "store.json");

const RETRY_DELAYS_MS = [250, 1000, 3000];

/**
 * One command against the store, retried on transport failures and 5xx.
 *
 * A container waking from sleep often makes its first request into a cold
 * network path, and a single blip there would otherwise surface as an empty
 * roster — which, for a store holding the do-not-call list, is the worst
 * possible way to fail. Auth and request errors are not retried: those will
 * never succeed and should be reported immediately.
 */
async function redis(command: unknown[]): Promise<unknown> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]));
    }
    try {
      const res = await fetch(REST_URL(), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${REST_TOKEN()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(command),
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });

      if (res.status === 401 || res.status === 403) {
        throw new Error("Storage credentials were rejected. Check the storage settings.");
      }
      if (res.status >= 500 || res.status === 429) {
        lastError = new Error(`Storage backend returned HTTP ${res.status}`);
        continue;
      }
      if (!res.ok) throw new Error(`Storage backend returned HTTP ${res.status}`);

      const body = (await res.json()) as { result?: unknown; error?: string };
      if (body.error) throw new Error(`Storage backend: ${body.error}`);
      return body.result;
    } catch (err) {
      // Credential failures are final; anything else is worth another go.
      if (err instanceof Error && err.message.includes("credentials were rejected")) throw err;
      lastError = err;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Storage backend did not respond after several attempts.");
}

export async function readBlob(): Promise<string | null> {
  if (backendKind() === "redis") {
    const v = await redis(["GET", KEY]);
    return typeof v === "string" ? v : null;
  }
  try {
    return fs.readFileSync(FILE, "utf8");
  } catch {
    return null;
  }
}

export async function writeBlob(json: string): Promise<void> {
  if (backendKind() === "redis") {
    await redis(["SET", KEY, json]);
    return;
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = FILE + ".tmp";
  fs.writeFileSync(tmp, json);
  fs.renameSync(tmp, FILE);
}

/** A quick round trip, so Setup can show whether storage is really reachable. */
export async function pingBackend(): Promise<{ ok: boolean; kind: string; error?: string }> {
  const kind = backendKind();
  try {
    if (kind === "redis") await redis(["PING"]);
    else await readBlob();
    return { ok: true, kind };
  } catch (err) {
    return { ok: false, kind, error: err instanceof Error ? err.message : String(err) };
  }
}
