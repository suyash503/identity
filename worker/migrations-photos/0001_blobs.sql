-- Ritual photo bytes. A photo database holds ~450 MB; the main database's `photos` table says which one has each photo.
CREATE TABLE blobs (
  key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('full', 'thumb')),
  data BLOB NOT NULL,
  PRIMARY KEY (key, kind)
);
