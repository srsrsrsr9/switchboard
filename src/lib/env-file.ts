import fs from "node:fs";
import path from "node:path";

const FILE = path.join(process.cwd(), ".env.local");

/**
 * Persist provisioning ids back to .env.local so they survive a restart.
 * Only the given keys are touched; the rest of the file is left byte-for-byte.
 */
export function writeEnv(updates: Record<string, string>): void {
  let text = "";
  try { text = fs.readFileSync(FILE, "utf8"); } catch { /* file may not exist yet */ }
  const lines = text.split(/\r?\n/);

  for (const [key, value] of Object.entries(updates)) {
    const i = lines.findIndex((l) => l.startsWith(`${key}=`));
    if (i === -1) lines.push(`${key}=${value}`);
    else lines[i] = `${key}=${value}`;
    process.env[key] = value;
  }
  fs.writeFileSync(FILE, lines.join("\n"), { mode: 0o600 });
}
