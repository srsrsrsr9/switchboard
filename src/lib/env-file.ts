import fs from "node:fs";
import path from "node:path";

const FILE = path.join(process.cwd(), ".env.local");

/**
 * Persist provisioning ids back to .env.local so they survive a restart.
 * Only the given keys are touched; the rest of the file is left byte-for-byte.
 *
 * Deployed hosts have a read-only filesystem, so the file write is best effort:
 * process.env is updated either way, and the ids are also kept in the store, so
 * a failure here costs nothing beyond having to set the var in the dashboard.
 * Returns whether the file was actually written.
 */
export function writeEnv(updates: Record<string, string>): boolean {
  for (const [key, value] of Object.entries(updates)) process.env[key] = value;

  let text = "";
  try { text = fs.readFileSync(FILE, "utf8"); } catch { /* file may not exist yet */ }
  const lines = text.split(/\r?\n/);
  for (const [key, value] of Object.entries(updates)) {
    const i = lines.findIndex((l) => l.startsWith(`${key}=`));
    if (i === -1) lines.push(`${key}=${value}`);
    else lines[i] = `${key}=${value}`;
  }

  try {
    fs.writeFileSync(FILE, lines.join("\n"), { mode: 0o600 });
    return true;
  } catch (err) {
    console.warn("[env] could not write .env.local (read-only filesystem?):", err);
    return false;
  }
}
