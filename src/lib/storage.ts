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
  return process.env.EPHEMERAL_STORAGE !== "1";
}

export const EPHEMERAL_REASON =
  "This is a demo environment: it does not keep records between restarts, so the do-not-call " +
  "list cannot be relied on here. Live calling is switched off for that reason. Use the main " +
  "console to place real calls.";
