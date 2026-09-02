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

State lives in `data/store.json` — delete it to start clean. Set `DATA_DIR` to move it
somewhere else, which is how the deployed build points it at a mounted volume.

## Deploying

This app is a **persistent process**: it holds the roster in memory and runs a dialer loop
on a 2.5-second tick. That rules out serverless hosts — on Vercel the filesystem store
would evaporate, the loop would never advance past the first tick because functions freeze
after responding, and Hobby cron (once per day) can't stand in for it. Deploy it somewhere
that runs a container continuously: Render, Railway, Fly, or any small VM.

A `Dockerfile` and a Render blueprint (`render.yaml`) are included.

### Render

`render.yaml` as committed targets the **free** plan, which means no persistent disk.

1. **New → Blueprint**, point it at this repo.
2. Set `APP_PASSWORD` when prompted. Nothing else is required for a simulation instance.
3. Open the URL, sign in.

### Posture

Demo deployments run **relaxed**: local calling hours, the weekend block, and the consent
requirement are all off, so an operator never has to remember a toggle before dialling. The
masthead carries a permanent banner saying so, and one button switches the full rules on
for an hour at a time.

Do-not-call suppression and the attempt cap are outside this entirely and apply in every
posture.

Set `RELAX_BY_DEFAULT=0` for production and it inverts: the full gate applies, and the
temporary override becomes the exception rather than the norm.

### Records storage

The store holds the do-not-call list and per-contact attempt counts, so it has to
outlive the container. Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` and the
console keeps everything in an external store over plain HTTPS — no driver, no pooling.
Without them it writes `data/store.json` on local disk, which is fine locally and useless
on an ephemeral host.

`EPHEMERAL_STORAGE=1` stays set on deployed instances as a safety net: if the storage
settings are ever removed, the console falls back to rehearsal rather than dialling with a
do-not-call list it cannot keep.

### Ephemeral hosts cannot dial

A free Render instance spins down after 15 minutes without traffic and has an ephemeral
filesystem, so the store — including **the do-not-call list and the per-contact attempt
counters** — is lost on every restart, redeploy, and spin-down. Losing that means calling
someone again after they asked not to be called, which is the exact failure the compliance
gate exists to prevent. The dialer loop also stops when the instance sleeps, orphaning any
call in flight.

So `EPHEMERAL_STORAGE=1` disables live dialing outright, at three layers:

- the store forces `dryRun` back on at load, so a stale or edited store cannot re-enable it
- `PATCH /api/settings` rejects `dryRun: false` with a 409
- the dialer re-checks immediately before placing a call and simulates instead

The console is fully usable this way — import, queue, transcripts, outcomes, appointments
all behave normally. Nothing dials.

To run real campaigns, switch `plan` to `starter`, add the `disk` block commented at the
bottom of `render.yaml`, and set `EPHEMERAL_STORAGE=0`. That instance type is billed
monthly. Running locally is the other durable option, and is free.

### Authentication

The console can start phone calls billed to your ElevenLabs and Twilio accounts, so it
refuses to run open to the internet. Set `APP_PASSWORD` and it serves a sign-in page,
setting a 12-hour HMAC-signed HttpOnly cookie; every page and every API route is behind
it, and login attempts are throttled after five failures. Set nothing and it will serve on
localhost only — any other Host header gets a 503 explaining why. `AUTH_SECRET` is
optional and defaults to the password.

This is single-shared-password auth, which suits one operator. It is not a user system —
there are no accounts, roles, or audit trail of who started a campaign.
