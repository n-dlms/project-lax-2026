# How LAX turns dates into a decision

[![14-day forecast](media/forecast.svg)](#forecast) [![Web and Android](media/platforms.svg)](#delivery) [![45 tests](media/checks.svg)](#verification)

[← Project LAX](../README.md) · [Explore the docs](README.md) · [Your data](SSDLC.md)

**See what a choice changes while there is still a choice to make.**

A person may need transport for work, electricity at home and school fees covered before a client payment arrives. LAX brings those entered commitments into date order so a purchase, delayed payment or proposed bill date can be checked against the same plan.

[Try a fictional decision in LAX](https://project-lax-2026.pages.dev/), then use the explanation below to inspect how the answer is reached.

## What a useful answer needs to show

A purchase check identifies an affected essential and its added gap. A date test shows both the selected bill and any shortfall elsewhere. A flexible-cost plan respects costs the person says cannot move. A check-in updates money on hand and removes the scheduled item together, so the next decision can use the changed plan.

The same model supports everyday essentials entered by name: electricity, groceries, transport, school fees, housing and more. The calculations run on the user's device. The web application is served as static files, and Android packages the interface through Capacitor.

## Components

| File | Responsibility |
| --- | --- |
| `app.js` | Forms, navigation, display and interaction events |
| `engine.js` | Rand-to-cent conversion, date arithmetic, daily forecasts, purchase decisions, income-pattern estimates, flexible-cost search and check-ins |
| `coach.js` | Bill runway, payday allocation, cushion tests, cash tally, late-pay comparison and bill-date comparison |
| `workspace.js` | Validation and recovery of unfinished interaction state |
| `backup.js` | Plan validation and passphrase-based encrypted backup/restore |
| `native-backup.js` | User-initiated Android encrypted-file sharing |
| `experience.js` | Opening guide state, sound preference and interaction cues |
| `freshness.js` | Refreshes a previously controlled web page when an updated service worker takes control |
| `scripts/build.mjs` | Copies web assets and generates the offline cache |
| `scripts/build-android.mjs` | Prepares native assets, bundles the native share module and versions module URLs |

## Forecast

The model includes money on hand, dated expenses, confirmed or possible income and historical received payments. Rand values are stored as integer cents. The forecast covers today and the next 14 days, starting on the South African calendar date.

Each day's expenses are checked before expected income on that day. The lowest daily balance determines the largest projected gap. A positive end-of-period balance does not remove an earlier shortfall. Overdue essential bills are treated as due now until updated; missing or overdue essentials prevent a reassuring purchase verdict.

Possible pay is excluded from conservative results. Income-pattern clues use medians of past payment amounts and intervals. They require review and do not silently become confirmed income.

## Comparisons and actions

- A purchase test reruns the whole forecast with the purchase. It can identify a later covered day when the initial plan permits one.
- A late-pay test changes a scheduled payment date in a comparison.
- A bill-date test compares a later date inside the forecast, reporting the selected bill's gap and the remaining full-plan gap separately. It retains the saved due date.
- The flexible-cost search tests permitted combinations and chooses a small workable total. Protected costs stay in the plan; an impossible gap is displayed.
- Received/Paid check-ins update money on hand and remove the scheduled item together. Undo restores the latest check-in when its balance and recurring-entry safeguards hold.

No comparison executes a payment, cancels a commitment or contacts a provider.

## Storage and backups

The plan and unfinished interaction state are validated and stored in browser or Android WebView `localStorage`. Ordinary local plan storage is not encrypted by LAX. Failed plan writes restore the last saved state.

Optional backups use AES-256-GCM and a passphrase-derived key. The passphrase is not stored in the workspace. Restores are previewed before replacement. Android shares a user-created encrypted file through a restricted FileProvider; no broad storage permission is requested.

## Delivery

The web build uses a self-hosted asset set, a Content Security Policy and a generated service worker. Code assets are checked online with a cached offline fallback. Android embeds its assets and removes web service-worker registrations so packaged updates are used.

The Android application ID is `za.co.projectlax.app`, with a minimum API of 24 and target API of 36. Signed updates require the same release certificate and an incremented version code. Signing material is kept outside the source repository.

## Verification

`npm run check` runs syntax checks and 45 tests covering forecast timing, possible income, purchases, date comparisons, protected costs, check-ins, backup integrity, launch preferences and draft recovery.

Automated tests and packaged-asset browser checks do not establish customer benefit or replace physical Android device testing. Broader adoption requires direct user observation and measured outcomes.
