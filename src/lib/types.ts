export type ContactStatus =
  | "pending" | "queued" | "calling" | "booked" | "declined"
  | "no_answer" | "failed" | "callback" | "dnc";

export type Contact = {
  id: string;
  name: string;
  phone: string;          // E.164
  raw: string;            // exactly as imported
  company?: string;
  email?: string;
  timezone: string;
  consent: boolean;       // prior express written consent on file
  dnc: boolean;           // suppressed: do not call
  status: ContactStatus;
  attempts: number;
  lastAttemptAt?: number;
  nextAttemptAt?: number;
  lastOutcome?: string;
  notes?: string;
  createdAt: number;
};

export type TranscriptTurn = { role: string; message: string; timeInCallSecs?: number };

export type Call = {
  id: string;
  contactId: string;
  contactName: string;
  phone: string;
  conversationId?: string;
  callSid?: string;
  status: "dialing" | "in_progress" | "processing" | "done" | "failed";
  outcome?: string;
  startedAt: number;
  endedAt?: number;
  durationSecs?: number;
  transcript: TranscriptTurn[];
  collected?: Record<string, unknown>;
  appointment?: { when?: string; email?: string; notes?: string };
  error?: string;
  simulated?: boolean;
};

/**
 * A time-boxed relaxation of the schedule gates, set by an operator.
 * Do-not-call suppression and the attempt cap are deliberately absent: those
 * are not relaxable, and nothing in the UI offers to.
 */
export type Override = {
  until: number;          // epoch ms; in the past means inactive
  setAt: number;
  callingHours: boolean;
  weekends: boolean;
  consent: boolean;
  note?: string;
};

export type Settings = {
  agentId: string;
  phoneNumberId: string;
  fromNumber: string;
  maxConcurrent: number;
  maxAttempts: number;
  retryDelayMins: number;
  callWindowStart: number;   // inclusive local hour
  callWindowEnd: number;     // exclusive local hour
  weekendCalling: boolean;
  requireConsent: boolean;
  dryRun: boolean;
  override: Override | null;
  /** Demo posture: the schedule gates are off unless enforcement is switched on. */
  relaxedByDefault: boolean;
  /** While in the future, full rules apply despite relaxedByDefault. */
  enforceUntil: number | null;
  business: {
    name: string;
    agentName: string;
    callbackNumber: string;
    blurb: string;
    slots: string;
  };
};

export type CampaignState = {
  running: boolean;
  startedAt?: number;
  stoppedAt?: number;
  lastError?: string;
  lastTickAt?: number;
};

export type Store = {
  contacts: Contact[];
  calls: Call[];
  settings: Settings;
  campaign: CampaignState;
};
