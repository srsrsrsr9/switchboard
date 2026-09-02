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

async function redis(command: unknown[]): Promise<unknown> {
  const res = await fetch(REST_URL(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REST_TOKEN()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Storage backend returned HTTP ${res.status}`);
  }
  const body = (await res.json()) as { result?: unknown; error?: string };
  if (body.error) throw new Error(`Storage backend: ${body.error}`);
  return body.result;
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
