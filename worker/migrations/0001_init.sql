-- Phones allowed to read and write backups. Only a hash of each token is stored.
CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen INTEGER,
  revoked INTEGER NOT NULL DEFAULT 0
);

-- Short-lived pairing requests. A phone shows the code; it's approved from the computer with `npm run approve`.
CREATE TABLE pairings (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  approved INTEGER NOT NULL DEFAULT 0,
  consumed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX pairings_code ON pairings (code);

-- Gzipped backup.json snapshots (same format as the .zip backup). The newest few dozen are kept.
CREATE TABLE snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  device_id TEXT NOT NULL,
  size INTEGER NOT NULL,
  data BLOB NOT NULL
);

-- Which ritual photos are safely in R2.
CREATE TABLE photos (
  key TEXT PRIMARY KEY,
  has_full INTEGER NOT NULL DEFAULT 0,
  has_thumb INTEGER NOT NULL DEFAULT 0,
  uploaded_at INTEGER NOT NULL
);
