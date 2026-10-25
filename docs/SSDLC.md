# Your data, your choices

[![Planning on your device](media/on-device.svg)](#data-flow) [![Backups use AES-256-GCM](media/backup.svg)](ARCHITECTURE.md#storage-and-backups)

[← Project LAX](../README.md) · [Explore the docs](README.md) · [How it works](ARCHITECTURE.md)

Trying a money-planning app should come with a clear account of what happens to your entries. Project LAX lets you explore a fictional decision without signup or bank credentials. When you enter your own numbers, calculations run on your device, and you choose whether to export an encrypted backup or copy a provider request.

[Try the example](https://project-lax-2026.pages.dev/) · [How the forecast works](ARCHITECTURE.md)

## Security and SSDLC notes

> **Scope.** Project LAX is a local-first planning prototype. This note describes what is implemented today and what must be added before any real-user pilot. It is not a certification or an independent security assessment.

**Updated 25 October 2026**

---

## Data flow

The browser or Android WebView accepts money on hand, dated income and expense entries, past income entries, and optional labels. All calculations run locally.

| Element | Behaviour |
| --- | --- |
| **Backend** | None |
| **Account or login** | None |
| **Bank connection** | None |
| **Third-party analytics or trackers** | None |
| **Local storage** | Plans and unfinished drafts persist in this browser's or Android WebView's `localStorage` |
| **Local storage encryption** | None; the browser store itself is not encrypted |
| **Backup** | Optional encrypted download on web or user-initiated Android Share; the passphrase is never saved in the workspace |
| **Fonts and photography** | Bundled locally |

## Implemented controls

- HTML text escaping for user-entered labels before insertion.
- A Pages Content Security Policy with a self-only script policy.
- Integer-cent amounts with nonnegative and upper-bound checks.
- Date limits in forms and ISO date arithmetic using the South African forecast date.
- No credentials, bank API, or payment execution.
- A confirmed erase-all action, separate from restoring the fictional example.
- Encrypted backup and restore.
- Visible wording that forecasts depend on entered data and that the app does not move money.
- Stored plans are validated before use.
- A failed browser write restores the last saved plan rather than showing an unsaved change.
- Spend Check excludes uncertain pay, checks same-day bills before unreceived pay, and refuses a covered verdict for missing or overdue essential bills.
- The provider conversation draft is editable and copied only after the user chooses; the app does not send it.
- The Android application requests Internet, disables cleartext traffic and Android cloud backup, and limits backup file sharing to its dedicated cache folder. Android also adds an application-scoped, non-exported dynamic receiver permission.
- Bill-date comparisons keep the saved due date unchanged; a copied provider request does not create an agreed arrangement.

The 45 automated tests cover shortfalls, late and possible income, rescue success and failure, bill-date comparisons, pattern estimates, check-ins, backup integrity, launch preferences, and draft recovery. Run them with `npm run check`.

## Risk register

| Risk | Current handling | Before any real pilot |
| --- | --- | --- |
| **Sensitive financial entries on a shared device** | Browser or Android WebView local storage, confirmed erase-all, and optional encrypted export. LAX does not encrypt normal local storage. | Retention choices, device-level access guidance, encrypted storage or a privacy-reviewed backend, and a plain-language privacy notice. |
| **Incomplete or stale entries create false confidence** | Possible income excluded by default; the interface explains that estimates depend on entered data. | Stale-data detection, reconciliation reminders, and task-based comprehension testing. |
| **A plan cannot actually be followed** | Only user-marked flexible expenses are suggested; impossible gaps are stated; the user can lock a cost they cannot move. Provider arrangements are never assumed. | Human review of copy, stress tests, accessibility review, and monitoring of harmful suggestions. |
| **Cross-site scripting through entered names** | Escaping before HTML interpolation and a self-only script policy on the Pages build. | Security review, dependency checks if libraries are added, and automated UI tests. |
| **Incorrect dates or timezones** | South African date for forecast start; ISO date arithmetic and tests. | Tests for DST-independent dates, month-end, leap years, locale formatting, and old-data migration. |
| **Future bank or notification integration** | Not implemented. | Explicit consent, regulated-partner review, least-privilege access, revocation, audit trail, incident response, POPIA assessment, and an independent penetration test. |

## Review limits

The current application has no independent penetration-test certification or POPIA certification and cannot transfer funds. Its release-build and signature checks do not establish broad physical-device compatibility or customer outcomes.

The hosted build is a static front end. Any future backend, open-finance connection, or messaging service would require a new threat model, data-retention rules, vendor review, and independent testing before launch.
