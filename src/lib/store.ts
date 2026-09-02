import type { Store, Settings } from "./types";
import { storageIsDurable } from "./storage";
import { readBlob, writeBlob } from "./storage-backend";

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
  override: null,
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

type G = typeof globalThis & {
  __callerStore?: Store;
  __callerLoad?: Promise<Store>;
  __callerFlush?: ReturnType<typeof setTimeout> | null;
  __callerDirty?: boolean;
};
const g = globalThis as G;

function hydrate(raw: string | null): Store {
  let s = emptyStore();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<Store>;
      s = {
        contacts: parsed.contacts ?? [],
        calls: parsed.calls ?? [],
        settings: {
          ...DEFAULT_SETTINGS,
          ...(parsed.settings ?? {}),
          business: { ...DEFAULT_SETTINGS.business, ...(parsed.settings?.business ?? {}) },
        },
        campaign: { ...(parsed.campaign ?? { running: false }), running: false },
      };
    } catch (err) {
      console.error("[store] stored data was unreadable, starting fresh:", err);
    }
  }
  // Env is the source of truth for provisioning ids when present.
  if (process.env.ELEVENLABS_AGENT_ID) s.settings.agentId = process.env.ELEVENLABS_AGENT_ID;
  if (process.env.ELEVENLABS_PHONE_NUMBER_ID) s.settings.phoneNumberId = process.env.ELEVENLABS_PHONE_NUMBER_ID;
  if (!storageIsDurable()) s.settings.dryRun = true;
  return s;
}

/**
 * Load the store once per process. Every route awaits this before touching
 * state; afterwards getStore() is a synchronous read of the in-memory copy.
 */
export async function ensureStore(): Promise<Store> {
  if (g.__callerStore) return g.__callerStore;
  if (!g.__callerLoad) {
    g.__callerLoad = readBlob()
      .catch((err) => {
        console.error("[store] could not read from storage backend:", err);
        return null;
      })
      .then((raw) => {
        g.__callerStore = hydrate(raw);
        return g.__callerStore;
      });
  }
  return g.__callerLoad;
}

/** Synchronous access to the loaded store. Call ensureStore() first. */
export function getStore(): Store {
  if (!g.__callerStore) g.__callerStore = hydrate(null);
  return g.__callerStore;
}

export function persist(): void {
  g.__callerDirty = true;
  if (g.__callerFlush) return;
  g.__callerFlush = setTimeout(() => {
    g.__callerFlush = null;
    if (!g.__callerDirty || !g.__callerStore) return;
    g.__callerDirty = false;
    void writeBlob(JSON.stringify(g.__callerStore)).catch((err) => {
      console.error("[store] write failed:", err);
      g.__callerDirty = true;
    });
  }, 400);
}

export function mutate<T>(fn: (s: Store) => T): T {
  const s = getStore();
  const out = fn(s);
  persist();
  return out;
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
