---
name: run-studio
description: "Run, start, build, launch, test, drive, or screenshot the CocoSales AI Next.js app (this repo, the 'nextn' package). Use when asked to run the app, start the dev server, take a screenshot of a page, check the login flow, or verify a UI change in the real running app."
---

# Run CocoSales AI (Next.js + Firebase)

A Next.js 15 app (App Router, Turbopack dev) for wholesale coconut sales, backed by
Firebase Auth and Firestore. Every page except `/login` requires a signed-in user, so an
unauthenticated run only exercises the login screen.

**Paths below are relative to the repo root** (`/home/user/studio`).

## Prerequisites

- Node 22 and npm 10 (verified: Node v22.22.0, npm 10.9.4). Nothing needed from `apt-get`.
- A Chromium for Playwright. The container ships one at `/opt/pw-browsers/chromium`, and
  the driver uses it automatically. Do **not** run `playwright install`.

## Setup

```bash
npm ci
```

Verified: `added 966 packages in 29s`. The Firebase web config is committed in
`src/firebase/config.ts`, so no `.env` file is required to run.

## Run (agent path): dev server + driver

Start the dev server in the background and wait for it:

```bash
npx next dev --turbopack -p 9002 > /tmp/next-dev.log 2>&1 &
until curl -s -o /dev/null -w '%{http_code}' http://localhost:9002/ | grep -q 200; do sleep 3; done
```

Verified: `✓ Ready in 1094ms`, first `/` compile took about 13s.

Then drive it with the committed Playwright driver:

```bash
# Full smoke: protected routes redirect to /login, login round trip, screenshots
node .claude/skills/run-studio/driver.mjs smoke

# Screenshot any single route
node .claude/skills/run-studio/driver.mjs shot /login
```

Verified output of `smoke`:

```
/           -> /login  OK
/clients    -> /login  OK
/sales      -> /login  OK
/inventory  -> /login  OK
/invoices   -> /login  OK
/settings   -> /login  OK
login toast: Login Failed | An unexpected error occurred. Please try again.
screenshots in /tmp/studio-shots
```

Screenshots land in `/tmp/studio-shots/` by default (`login.png`, `login-toast.png`,
`_clients.png`, ...). Override with `SHOTS_DIR=...`, or point at another server with
`BASE_URL=...`. Read the PNGs to confirm what rendered; a blank page or an error overlay
means the run failed even if the driver exited 0.

Stop the server when done. The `[n]` bracket keeps `pkill` from matching its own shell command line:

```bash
pkill -f "[n]ext dev --turbopack"
```

## Run (human path)

`npm run dev` starts the same server on port 9002 and prints the URL. It is not useful
headless: nothing is shown and it does not stop on its own.

## Authenticated flows

Clients, sales, inventory, invoices, and settings are only reachable with a real signed-in
account. This skill does not include credentials, so authenticated pages have not been
exercised. To drive them, add a sign-in step to the driver and supply the test account
through environment variables. Do not commit credentials.

## Gotchas

- **Unauthenticated visits to any protected route redirect to `/login`.** This is expected,
  not a crash. A screenshot of `/clients` without credentials shows the login card.
- **Anonymous sign-in is not used for gating.** `src/firebase/provider.tsx` calls
  `signInAnonymously`, but the protected routes still redirect. Don't assume an anonymous
  session will reach the app.
- **Bad credentials surface as a generic toast.** The login round trip reaches
  `identitytoolkit.googleapis.com` and gets a 400. The UI then shows
  "An unexpected error occurred. Please try again." rather than an invalid-credentials
  message. That is the app's current behavior, not a driver problem.
- **Turbopack's first compile is slow.** The first `/` request can take about 13s. The
  driver waits for `networkidle` with a 120s timeout, so this is covered. Don't treat a
  slow first load as a failure.
- **Firebase needs outbound HTTPS.** Login requests go to Google. If they fail, the toast
  will show a network error instead. Check the container's network policy before debugging
  the app.
- **Next.js ignores type and lint errors at build time.** `next.config.ts` sets
  `ignoreBuildErrors` and `ignoreDuringBuilds`. A clean build does not mean the types are
  clean. Run `npm run typecheck` separately if you need that signal.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `curl` to `:9002` never returns 200 | Dev server not started or crashed | Check `/tmp/next-dev.log`; restart with the command above |
| `smoke` fails with "Executable doesn't exist" | Playwright could not find the browser | Confirm `/opt/pw-browsers/chromium` exists; do not reinstall Playwright |
| `smoke` hangs at the login toast step | Firebase request blocked or slow | Check network access to `identitytoolkit.googleapis.com`; re-run with a longer timeout |
| `Cannot find module 'playwright'` | Not in local `node_modules` and not in `/opt/node-tools` | The driver falls back to `/opt/node-tools`; confirm that path exists |
