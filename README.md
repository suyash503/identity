# IDENTITY

Do the bare minimum every day. The bare minimum is who you are.

A personal, offline-first habit app (installable phone web app) built around:
- **Bare minimum vs full** for each identity (Gym, DSA, GitHub, PyTorch)
- **Photo ritual:** hold to seal each habit with a photo
- **Never miss twice:** Danger Days, and chains that only break on two misses in a row
- **Ghost race:** you vs last-week, last-month and last-quarter you
- **Alankrit:** an adaptive rival who does the same habits, posts live updates and talks a little trash
- **GitHub auto-seal:** any push seals the GitHub habit
- **Backup:** one .zip with all history and photos (share to Drive on Android), full restore
- **Cloud backup:** automatic sync to your own Cloudflare Worker (D1 for history and photos, free tier, no card)

See [SPEC.md](SPEC.md) for the full product spec.

## Run it

```bash
npm install
npm run dev
```

The dev server listens on your network too (`--host`). In development, Settings has **Load demo data** and **Reset everything** buttons.

## Build

```bash
npm run build
```

Output goes to `dist/` as a static site with a service worker for offline use. To serve it from a sub-path (e.g. GitHub Pages at `/identity/`), set `BASE=/identity/` when building.

## Cloud backup server (`worker/`)

A Cloudflare Worker with D1 databases: `identity` (devices, history snapshots, photo index) and `identity-photos-N` (photo bytes). All free tier, no card needed.

```bash
cd worker
npm install
npm run migrate   # apply the D1 schema
npm run deploy
```

**Pairing a phone:** in the app go to Settings → Cloud backup → Connect this phone. The phone shows a 6-digit code. Approve it from `worker/`:

```bash
npm run approve -- 123456
```

The phone gets its own token (only a hash is stored on the server), so no secrets are ever typed or copied. Snapshots are gzipped `backup.json`, and the newest 60 are kept. A freshly paired, empty phone never overwrites an existing backup; it offers to restore it instead.

**Photos** live in D1 "photo databases" (a free D1 database holds 500 MB; the Worker fills each to 450 MB). New photos go to the last one listed in `PHOTO_SHARDS`. When the app reports that cloud photo storage is full (about a year of photos per database):

```bash
npx wrangler d1 create identity-photos-2
# add a PHOTOS_2 binding (migrations_dir: migrations-photos) to wrangler.jsonc
# set "PHOTO_SHARDS": "PHOTOS_1,PHOTOS_2"
npx wrangler d1 migrations apply identity-photos-2 --remote
npm run types && npm run deploy
```

## Where the code lives

| Path | What |
|---|---|
| `src/db.ts` | IndexedDB schema (Dexie) + default habits |
| `src/lib/day.ts` | Day keys; a day ends at 4 AM |
| `src/lib/stats.ts` | Status, danger days, chains, ghost race |
| `src/lib/alankrit.ts` | Rival generation (seeded, adaptive, locked per day), scoring, trash talk |
| `src/lib/github.ts` | GitHub push detection |
| `src/lib/backup.ts` | Backup format, .zip export/import, restore |
| `src/lib/cloud.ts` | Pairing, auto-sync and restore against the Worker |
| `worker/` | Cloudflare Worker + D1 schemas (`migrations/`, `migrations-photos/`) for cloud backup |
| `src/screens/` | Today, Race, Rituals, Settings |
| `src/components/` | Habit cards, ritual flow, hold-to-seal, rival feed, miss check-in |

All data lives on the device. Backups are copies you control.
