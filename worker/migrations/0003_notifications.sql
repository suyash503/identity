-- Compact current state uploaded by the app (recent seals, habits, Alankrit's recent days). One row.
CREATE TABLE state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  updated_at INTEGER NOT NULL,
  data TEXT NOT NULL
);

-- Alankrit's days locked in by the server (when the app wasn't open). The app adopts these instead of rolling its own.
CREATE TABLE rival_days (
  day TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  time_zone TEXT NOT NULL,
  prefs TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- One row per notification ever sent, so each one goes out exactly once.
CREATE TABLE push_sent (
  key TEXT PRIMARY KEY,
  sent_at INTEGER NOT NULL
);
