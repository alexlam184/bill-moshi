# Bill Moshi

Bill Moshi is a mobile-first expense-sharing PWA built from the product specification in Notion. Its organizing hierarchy is **Group → Event → Expense**: a group is a long-lived family, roommate, friend, or team space, while an event is one specific trip or activity inside that group. Group owners approve invitation requests, and approved members are inherited by the group’s events. It supports multi-currency expenses, equal/exact/percentage/share splits, balances, partial settlements, receipts, and an IndexedDB offline queue.

## Run locally

```bash
pnpm install
cp .env.example .env.local
pnpm dev
npm run dev -- --hostname 0.0.0.0 --port 3000
```
open the web  "http://10.0.0.100:3000" by your phone

The app works immediately with sample data. To connect Google-owned storage, create Google OAuth web credentials, enable the Google Drive and Google Sheets APIs, fill in `.env.local`, and add `http://localhost:3000/api/auth/callback/google` as a redirect URI.

## Checks

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## Storage design

- IndexedDB stores the local snapshot, queued idempotent operations, and pending receipt blobs.
- Google OAuth requests profile, `drive.file`, and Sheets scopes only.
- A server-only adapter creates isolated Personal and per-Group workspaces, then routes every queued operation to the correct `Data` Sheet.
- `Bill Moshi/Personal` is enforced as owner-only and contains its own `Data` Sheet plus `Uploads` folder.
- Every Group has an individual folder containing its own `Data` Sheet plus `Uploads` folder. The folder starts private and is shared only with approved members (`writer`) or viewers (`reader`).
- The `Bill Moshi` root is never shared. Personal receipts remain private; Group receipts inherit that Group folder's approved membership.
- Newly created scoped Sheets are seeded from the offline snapshot. The former shared workbook is retained as `Legacy - Bill Moshi Data`, and historical receipt files are moved into their matching Uploads folders when accessible.
- Invitation tokens are hashed before workbook persistence. Pending invitees never receive event financial data from the join screen.

The current collaboration implementation is an MVP: local/demo mode is single-device, while production multi-user invitations require a shared server-side authorization layer so ownership checks cannot be bypassed by a modified client.
