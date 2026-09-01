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
  "This deployment has no persistent disk, so the do-not-call list and attempt counts are " +
  "lost whenever it restarts or sleeps. Live dialing is disabled here. Run the console " +
  "locally, or on an instance with a mounted volume, to place real calls.";
