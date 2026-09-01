# Switchboard

A local operator console that runs outbound AI phone calls through ElevenLabs Agents +
Twilio, to book consultations for an IRS audit representation practice.

Load a list of numbers, start the campaign, watch the lines go live and the transcripts
stream in, and collect the appointments that came out of it.

```bash
npm install
npm run dev        # http://localhost:3210
```

## How it works

```
roster (JSON store)
   │
   ├─ compliance gate ── calling window in the contact's own timezone,
   │                     consent flag, DNC flag, attempt cap, retry backoff
   │
   ├─ dialer loop ────── keeps N lines busy, ~2.5s tick
   │                     POST /v1/convai/twilio/outbound-call
   │
   └─ poll ───────────── GET /v1/convai/conversations/{id}
                         transcript + post-call analysis → outcome
```

Outcomes come from the agent's own post-call data collection: `appointment_booked`,
`appointment_time`, `contact_email`, `do_not_call`, `callback_requested`, `reached_human`.
A `do_not_call` result flips the contact to suppressed permanently; a callback request
reschedules; no answer requeues until the attempt cap.

## Setup

`.env.local` holds the credentials. `ELEVENLABS_API_KEY`, `TWILIO_ACCOUNT_SID`, and
`TWILIO_PHONE_NUMBER` are already filled in. The remaining two steps happen in the app's
**Setup** tab:

1. **Create the agent** — builds the ElevenLabs agent from the script in
   `src/lib/script.ts`, with the voice you pick. Writes `ELEVENLABS_AGENT_ID` back to
   `.env.local`. Re-run it after editing the firm name, agent name, or offered slots to
   push the new script.
2. **Connect the number** — paste your Twilio auth token to import
   `TWILIO_PHONE_NUMBER` into ElevenLabs. The token is used for that one request and is
   never written to disk. Writes `ELEVENLABS_PHONE_NUMBER_ID` back to `.env.local`.

`DRY_RUN=1` (the default) simulates every call end to end — queueing, transcripts,
outcomes, retries — without dialing anything. The **Place real calls** switch in Setup
flips it. The masthead always shows which mode you are in.

## Loading numbers

Paste or drop a CSV. A header row is optional and column names are matched loosely
(`phone`/`number`/`mobile`/`cell`, `name`/`full name`/`contact`, plus `company`, `email`,
`consent`, `dnc`, `notes`). Bare numbers, one per line, also work — including mixed in
under a header. Everything is normalised to E.164 and matched to a timezone by area code.
Rows that can't be parsed are listed back to you with the reason, never dropped silently.

## What the agent will and won't do

The prompt in `src/lib/script.ts` is the compliance surface. It opens by disclosing that
it is an AI, states the firm is private and not the IRS, refuses to take an SSN, bank
details, or payment, gives no tax advice, uses no urgency or penalty threats, and ends the
call immediately on any opt-out. Four evaluation criteria are scored on every call —
`disclosed_ai`, `no_irs_impersonation`, `no_sensitive_data`, `honored_opt_out` — and a
failure is surfaced on the call card in the Lines panel.

The dialer refuses to place a call outside 9am–8pm in the *called party's* local time
(configurable), on weekends unless you allow it, past the attempt cap, to a suppressed
number, or — while **Only call numbers marked as consented** is on — to any number without
a consent flag. Held-back rows say which rule is holding them.

None of this makes a campaign lawful on its own. TCPA prior express written consent, the
national and state DNC registries, state-level AI-disclosure and robocall rules, and
call-recording consent are yours to satisfy before you turn off simulation mode.

## Layout

```
src/lib/         phone.ts       E.164 + NANP area-code → timezone
                 compliance.ts  the pre-call gate
                 dialer.ts      campaign loop, polling, simulation
                 elevenlabs.ts  API client
                 script.ts      agent prompt + analysis schema
                 import.ts      CSV / list parser
                 store.ts       JSON persistence (data/store.json)
src/app/api/     state, contacts, campaign, settings, setup, voices
src/components/  Console, Roster, Lines, Appointments, Setup, ImportDrawer
```

State lives in `data/store.json` — delete it to start clean.
