-- Recovery phrase: lets a phone that lost its storage reconnect itself, without a pairing code
-- approved on the computer. Only a salted hash is stored. Wrong guesses are rate-limited.
CREATE TABLE recovery (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  salt TEXT NOT NULL,
  hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE recovery_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL
);
