import fs from "node:fs";
import path from "node:path";
import type { Store, Settings } from "./types";
import { storageIsDurable } from "./storage";

// DATA_DIR lets a deployment point this at a mounted volume that survives restarts.
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "store.json");

const DEFAULT_SETTINGS: Settings = {
  agentId: process.env.ELEVENLABS_AGENT_ID || "",
  phoneNumberId: process.env.ELEVENLABS_PHONE_NUMBER_ID || "",
  fromNumber: process.env.TWILIO_PHONE_NUMBER || "",
  maxConcurrent: 2,
  maxAttempts: 2,
  retryDelayMins: 180,
  callWindowStart: 9,
  callWindowEnd: 20,
  weekendCalling: false,
  requireConsent: true,
  dryRun: process.env.DRY_RUN !== "0",
  business: {
    name: "Meridian Tax Resolution",
    agentName: "Avery",
    callbackNumber: process.env.TWILIO_PHONE_NUMBER || "",
    blurb:
      "licensed enrolled agents and tax attorneys who represent individuals and small businesses " +
      "during IRS audits, examinations, and correspondence reviews",
    slots: "Tuesday at 10:00 AM, Wednesday at 2:00 PM, or Thursday at 4:00 PM Eastern",
  },
};

function emptyStore(): Store {
  return { contacts: [], calls: [], settings: { ...DEFAULT_SETTINGS }, campaign: { running: false } };
}

type G = typeof globalThis & { __callerStore?: Store; __callerWriteQueue?: Promise<void> };
const g = globalThis as G;

function load(): Store {
  if (g.__callerStore) return g.__callerStore;
  let s = emptyStore();
  try {
    if (fs.existsSync(FILE)) {
      const parsed = JSON.parse(fs.readFileSync(FILE, "utf8")) as Partial<Store>;
      s = {
        contacts: parsed.contacts ?? [],
        calls: parsed.calls ?? [],
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}),
                    business: { ...DEFAULT_SETTINGS.business, ...(parsed.settings?.business ?? {}) } },
        campaign: { ...(parsed.campaign ?? { running: false }), running: false },
      };
    }
  } catch (err) {
    console.error("[store] could not read store.json, starting fresh:", err);
  }
  // Env is the source of truth for provisioning ids when present.
  if (process.env.ELEVENLABS_AGENT_ID) s.settings.agentId = process.env.ELEVENLABS_AGENT_ID;
  if (process.env.ELEVENLABS_PHONE_NUMBER_ID) s.settings.phoneNumberId = process.env.ELEVENLABS_PHONE_NUMBER_ID;
  // An ephemeral deployment can lose the DNC list, so it may only ever simulate.
  if (!storageIsDurable()) s.settings.dryRun = true;
  g.__callerStore = s;
  return s;
}

/** In-memory store; every mutation is flushed to disk atomically. */
export function getStore(): Store {
  return load();
}

let flushTimer: NodeJS.Timeout | null = null;
export function persist(): void {
  load();
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = FILE + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(g.__callerStore, null, 2));
      fs.renameSync(tmp, FILE);
    } catch (err) {
      console.error("[store] write failed:", err);
    }
  }, 250);
}

export function mutate<T>(fn: (s: Store) => T): T {
  const s = load();
  const out = fn(s);
  persist();
  return out;
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
