/**
 * Whether this deployment's store survives a restart.
 *
 * On an ephemeral host (a free instance with no mounted disk) the JSON store is
 * wiped on every redeploy, restart, and spin-down. That takes the do-not-call
 * list and the per-contact attempt counters with it, so the same person can be
 * called again after asking not to be. Real dialing is therefore refused
 * outright when storage is ephemeral — the console still runs, in simulation.
 */
export function storageIsDurable(): boolean {
  // An external store outlives the container, so the host being ephemeral no
  // longer matters — that is the whole point of configuring one.
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) return true;
  return process.env.EPHEMERAL_STORAGE !== "1";
}

export const EPHEMERAL_REASON =
  "This deployment has nowhere durable to keep records, so the do-not-call list would not " +
  "survive a restart. Live calling is switched off until a storage backend is configured.";
