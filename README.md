# Bill Moshi

Bill Moshi is a mobile-first record-sharing PWA built from the product specification in Notion. A Group is a long-lived family, roommate, friend, or team space; an Event is an optional trip or activity inside a Group. Records can be expenses, income, or transfers, and daily records do not require an Event. Group owners approve invitation requests, and approved members are inherited by the Group’s events. The app supports multi-currency records, equal/exact/percentage splits, balances, partial settlements, receipts, and an IndexedDB offline queue.

## Run locally

```bash
corepack pnpm install
cp .env.example .env.local
corepack pnpm dev --hostname 0.0.0.0 --port 3000
```

To open the app on an iPhone connected to the same Wi-Fi, find the Mac’s local address with `ipconfig getifaddr en0`, then open `http://<local-address>:3000` on the phone.

The app starts with an empty personal account. Sample records are available only through Developer mode. To connect Google-owned storage, create Google OAuth web credentials, enable the Google Drive and Google Sheets APIs, fill in `.env.local`, and add `http://localhost:3000/api/auth/callback/google` as a redirect URI.

## Checks

```bash
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm build
```

## Storage design

### Clean record rebuild

The shared transaction model is `LedgerRecord` (expense, income, or transfer), with `RecordSplit`, `recordId`, `snapshot.records`, and `addRecord` / `updateRecord` / `deleteRecord`. `expense` remains a transaction type and a spending-total label, not the name of the generic model. Record pages use `/records/new` and `/records/[recordId]`. Old routes and payload aliases are not supported.

This is an intentional destructive local rebuild, not a data migration. On the first launch of database version 5, all pre-rebuild Bill Moshi device stores are erased: records, groups, schedules, debts, queued sync items, receipt/photo blobs, and restore metadata. Unsynced data cannot be recovered from the app. Later launches keep newly created data. Close all older Bill Moshi tabs/app windows before reopening on each device; each browser origin has its own database. Google Drive data is not deleted by this rebuild—remove it manually before resuming sync. No initial Google sync runs for the empty account. Worksheets use `Records`, `RecordSplits`, and `record_id`, without converting or archiving old worksheets.

### Personal recurring payments

Open **Myself → Recurring payments** to add a fixed personal bill, choose a daily/weekly/monthly/yearly interval, and optionally set an end date. Each schedule has its own details page with the previous payment, next payment, and linked record history. Edits affect future payments; pause, resume, skip-next, and deleting the schedule preserve past records.

Due dates create ordinary personal expenses when the app opens, comes into focus, regains internet, or checks while open (once per minute). Missed dates are processed in bounded batches. There is no server scheduler or bank charging integration. Paused dates are skipped on resume. Month-end and leap-day schedules retain their original anchor day.

Occurrence IDs, cursors, generated expenses, and queued sync operations are stored atomically in IndexedDB. An occurrence is not recreated after a reload, concurrent processing, or deletion of its expense. Schedules sync to the **Personal Data → RecurringPayments** tab only; expenses carry `recurring_payment_id` and `recurring_payment_date` links. Foreign-currency rates are requested only when creating due records. Offline payments retain their original currency and appear in the existing missing-conversion workflow when necessary. Current quotes are labelled with their actual effective date, not represented as historical rates.

### Restore from Google Drive

Open **Settings → Restore from Google Drive** on a new device. The app discovers current Bill Moshi Personal and Group Data sheets, verifies the signed-in account and active Group membership, and shows a preview before writing anything locally. Restore is add-only: existing device records and queued changes win, unchanged built-in sample items may be replaced by their backup versions, and persistent deletion markers prevent a previously deleted record from returning after its delete operation has synced. Amounts, splits, currencies, saved exchange rates, debt status, recurring cursors, and Drive receipt/photo links are validated and restored; malformed rows are listed as skipped. Invitation links, activity history, and file bytes are not imported. Restore does not create, edit, move, share, or delete files in Google Drive and does not queue restored records back to Sheets.

- IndexedDB stores the local snapshot, queued idempotent operations, and pending receipt blobs.
- Google OAuth requests profile, `drive.file`, and Sheets scopes only.
- A server-only adapter creates isolated Personal and per-Group workspaces, then routes every queued operation to the correct `Data` Sheet.
- `Bill Moshi/Personal` is enforced as owner-only and contains its own `Data` Sheet plus `Uploads` folder.
- Every Group has an individual folder containing its own `Data` Sheet plus `Uploads` folder. The folder starts private and is shared only with approved members (`writer`) or viewers (`reader`).
- The `Bill Moshi` root is never shared. Personal receipts remain private; Group receipts inherit that Group folder's approved membership.
- Newly created scoped Sheets are seeded from the offline snapshot. The former shared workbook is retained as `Legacy - Bill Moshi Data`, and historical receipt files are moved into their matching Uploads folders when accessible.
- Invitation tokens are stored and resolved by the server-side collaboration registry. Pending invitees receive only a safe Group preview; financial records remain unavailable until approval.
- Group ownership is recorded in the collaboration registry and is not accepted from client payloads. Only the registered owner can approve requests, reconcile Drive sharing, force a conflicting phone copy into Sheets, or delete the Group.
- A missing or inaccessible Drive folder is treated as temporarily unavailable, so unsynced local changes are retained. Local Group data is removed only after a confirmed owner deletion tombstone is received.

### Collaboration registry

Invitation approvals, authoritative Group ownership, and deletion tombstones are stored in `.bill-moshi-data/collaboration.json` by default. The file is excluded from Git and written atomically with owner-only permissions. This is suitable for the local laptop host. In an environment with an ephemeral application filesystem, set `BILL_MOSHI_DATA_DIR` to an absolute path on persistent storage; all app instances must use the same registry directory for reliable multi-user collaboration.

A Group must complete its first Google sync before its owner can create an invitation link. This establishes ownership from the Group Data Sheet before the collaboration registry accepts access-management actions.
