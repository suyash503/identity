# IDENTITY — Product Spec (v0.1 draft)

> Do the bare minimum every day. The bare minimum is who you are.

A personal app for one user (me). It protects a daily **bare minimum** for each identity I'm building, makes every completion a small **ritual** (a photo), and shows me **racing my past self** so it never catches up.

---

## 1. Core principles

1. **The minimum is the identity.** Every habit has a *full* version and a *bare minimum* version. Doing the minimum still counts as keeping the identity. The full version is a bonus.
2. **Never miss twice.** One miss is normal. Two misses in a row is the real danger, and the app treats day 2 as an alarm.
3. **Run from the past self.** Motivation comes from beating who I was, not from comparing myself to others. Every habit shows me racing a "ghost" of my past self.
4. **Rituals, not checkboxes.** You complete a habit by taking a photo, not by ticking a box.
5. **Misses are data, not guilt.** Every miss asks one question: *what got in the way?* Over time these answers reveal triggers I can't see today.
6. **Zero friction.** Logging a completion should take less than 10 seconds. If it's slow, I'll stop using it.

---

## 2. Identities and habits (initial setup)

| Identity | Habit | Full version | Bare minimum | Verification |
|---|---|---|---|---|
| **Health**: "I'm someone who shows up to train" | Gym | Full workout | Go to the gym and do the treadmill | Photo |
| **Study**: "I'm someone who solves problems" | DSA (LeetCode) | Solve 2+ problems | Watch one lecture, then write one problem on my own | Photo |
| **Work**: "I'm someone who builds every day" | GitHub commit | Ship a meaningful chunk of work | 1 real commit | **Auto-check via GitHub API** |
| **Skill**: "I'm someone mastering deep learning" | PyTorch | Implement the concept in code | Understand one PyTorch concept | Photo |

Full versions are defaults and can be edited in Settings.

Each day, each habit ends in one of three states: **Full**, **Minimum** (both keep the identity), or **Missed**.

---

## 3. Photo ritual

- Completing a habit opens the camera directly. Snap, add an optional one-line caption, done.
- The photo is shown with the identity line: *"Day 142 · I'm someone who trains."* This is the moment I "vote" for my identity.
- **Daily identity card:** a collage of that day's photos.
- **Timeline:** scroll back through every ritual photo per habit.
- *(Later)* Monthly montage / time-lapse, e.g. gym progress over 90 days.

---

## 4. Ghost of the past self

For each habit (and overall), the app races me against my own history:

- **Score** = identity-kept days in the current window (Full or Minimum = 1 day). Full days are shown separately as a bonus stat.
- **Ghost** = my score in the window just before it: last week-me, last month-me, last quarter-me.
- Home screen shows the gap: *"You're 6 days ahead of last-month you"* or *"Last-month you is catching up: 2 days behind."*
- Visual: a race track with me and my ghost. A miss moves the ghost closer.
- **Chain:** the number of days since I last missed twice in a row. A single miss only cracks the chain; two misses in a row break it.

---

## 4b. Alankrit, the rival

An imaginary rival named **Alankrit** does the same 4 habits every day, and I compete with him on each one, just for fun. **He runs alongside the ghost:** the ghost is the serious measure of progress, Alankrit is the fun one.

**Strength: adaptive.** He stays slightly ahead of me.
- For each habit, his chance of showing up on a given day = my 30-day consistency for that habit **+ ~8%**, kept between 35% and 95%.
- His split between Full and Minimum follows my own ratio, nudged slightly higher.
- Rubber band: if I fall far behind in a week, he eases off a little so the fight never feels hopeless. If I'm far ahead, he pushes harder.

**Fair play.** His whole day is generated each morning from a fixed seed (date + habit), before I do anything. The app can't rewrite his results after seeing mine, so every win is real.

**Live updates.** He completes each habit at a realistic time of day, with a random jitter:
- Gym: morning (6–9 AM)
- PyTorch: afternoon
- DSA: evening
- GitHub: late night

These updates appear in a feed on the Today screen: *"Alankrit sealed Gym at 6:40 AM."* In Phase 1 the feed updates whenever I open the app. In Phase 2 they become real push notifications, which needs a small server.

**Scoring.**
- Daily, per habit: Full beats Minimum, Minimum beats a miss, and equal results are a draw.
- **Weekly matchup:** 4 battles, one per habit.
- **Monthly season:** a season winner and trophies (e.g. "Took the DSA crown in October").
- **All-time record:** e.g. "You 142 – Alankrit 131."

**Personality: light trash talk.** He's cheeky, never cruel. Example lines:
- *"Gym done at 6:40. You up yet?"*
- *"Rest day again? I'm not tired."*
- *"You out-worked me on DSA this week. Won't happen twice."*
- On my Danger Days he switches to pressure, not mockery: *"You missed yesterday. Miss today and I'm lapping you."*
- He's a good loser when I beat him, so wins feel earned.

---

## 5. Never-miss-twice alarm

- After a miss, that habit is marked **Danger Day** for the next day.
- On a Danger Day: the habit is shown at the top in red, reminders escalate (morning, afternoon, evening), and the bare minimum is suggested aggressively ("Just do the minimum. 10 minutes.").
- GitHub: an evening check at ~9pm. If there's no commit today, send a push notification.

---

## 6. Check-ins and pattern engine

- **Miss check-in:** the next time I open the app after a miss, it asks "what got in the way?" with quick-tap chips (tired, slept late, phone, stress, no plan, social, other).
- **Evening check-in (later):** energy 1–5, mood, and sleep time.
- **Pattern engine (after ~3 weeks of data):** finds correlations, e.g. "82% of gym misses follow nights you slept after 1am" or "DSA misses cluster on Thursdays."

---

## 7. Tech approach

- **Platform:** installable phone web app (PWA), used primarily on **Android**. Android supports camera, push notifications and home-screen install well.
- **Frontend:** React + Vite + Tailwind, mobile-first, offline-capable.
- **Storage:** local-first (IndexedDB on the phone, works fully offline). Cloud backup can come later.
- **Integrations:** GitHub API (commit auto-check). LeetCode blocks direct browser access, so a DSA auto-check needs a small server (later).
- **Day boundary:** a day ends at 4 AM, not midnight, so late-night work counts for the right day.

---

## 8. Build phases

**Phase 1: Core loop (MVP)**
- Today screen: 4 identities with full/minimum versions
- Photo ritual when completing a habit
- Never-miss-twice Danger Days and "chain" (breaks only on 2 misses in a row)
- Ghost race (week / month / quarter) + contribution-style heatmaps
- GitHub auto-check
- Miss check-in ("what got in the way?")
- Photo timeline

**Phase 2: Reach and safety**
- Push reminders (small server with a scheduled job + web push)
- Backup / restore: backup file ✅ (one .zip, share to Drive, restore with confirmation, overdue nudge). Cloud backup ✅ (Cloudflare Worker + D1, phone pairing by code, auto-sync, photos in D1 photo databases)
- LeetCode auto-check
- Pattern insights from miss reasons

**Phase 3: Growth**
- Adaptive difficulty ("You've hit this 90% for 3 weeks. Level up?")
- Monthly montage / time-lapse of ritual photos
- Evening check-in (energy, mood, sleep)

## 9. Decisions log

- 2026-09-25: No AI coach.
- 2026-09-25: Visual quality is the top priority. Dark, athletic, premium look.
- 2026-09-25: Skill = PyTorch. DSA on LeetCode. Android phone.
- 2026-09-25: Backend = Cloudflare Workers + D1. Chosen over Supabase for no pausing when inactive. Photos go in D1 "photo databases" (~450 MB each, up to ~4.5 GB free) instead of R2, because R2 requires a card on file.
- 2026-09-25: Add rival "Alankrit": adaptive difficulty, runs alongside the ghost, light trash talk, live updates (in-app feed in Phase 1, push notifications in Phase 2).
