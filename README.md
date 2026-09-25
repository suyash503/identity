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

## Where the code lives

| Path | What |
|---|---|
| `src/db.ts` | IndexedDB schema (Dexie) + default habits |
| `src/lib/day.ts` | Day keys; a day ends at 4 AM |
| `src/lib/stats.ts` | Status, danger days, chains, ghost race |
| `src/lib/alankrit.ts` | Rival generation (seeded, adaptive, locked per day), scoring, trash talk |
| `src/lib/github.ts` | GitHub push detection |
| `src/screens/` | Today, Race, Rituals, Settings |
| `src/components/` | Habit cards, ritual flow, hold-to-seal, rival feed, miss check-in |

All data stays on the device.
