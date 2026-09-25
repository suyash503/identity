-- Photos live in D1 photo databases (no card needed for R2). Track where each one is and how big it is.
ALTER TABLE photos ADD COLUMN shard TEXT;
ALTER TABLE photos ADD COLUMN bytes INTEGER NOT NULL DEFAULT 0;
