-- Google sign-in and a short password sign-up for an EXISTING shop database.
-- Run once, after db/auth-migration-002.sql:
--   npx wrangler d1 execute peppynose_shop --remote --file=db/auth-migration-003.sql
--
-- This copies every account into a new users table, then replaces the old one.
-- Orders, products, sessions and one-time codes are not dropped. Foreign keys are
-- turned off only for that replace, because sessions point at users.
-- Existing rows that already have a name and an email are marked profile_complete
-- so those people are not sent through "Your details" again.
-- A second run clears google_sub (the copy reads the pre-Google columns). Run once.
-- Do not run db/schema.sql on a live database. It drops every shop table.
-- Skip this file if the database was created from the current schema.sql.

PRAGMA foreign_keys = OFF;

CREATE TABLE users_new (
  id               TEXT PRIMARY KEY,
  email            TEXT UNIQUE COLLATE NOCASE,
  username         TEXT UNIQUE COLLATE NOCASE,
  mobile           TEXT UNIQUE,
  name             TEXT,
  password_hash    TEXT,
  google_sub       TEXT UNIQUE,
  profile_complete INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL
);

INSERT INTO users_new (id, email, username, mobile, name, password_hash, google_sub, profile_complete, created_at)
SELECT id, email, username, mobile, name, password_hash, NULL,
  CASE
    WHEN name IS NOT NULL AND length(trim(name)) >= 2 AND email IS NOT NULL AND instr(email, '@') > 1 THEN 1
    ELSE 0
  END,
  created_at
FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

CREATE UNIQUE INDEX IF NOT EXISTS users_username ON users(username COLLATE NOCASE);
CREATE UNIQUE INDEX IF NOT EXISTS users_mobile ON users(mobile);
CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub ON users(google_sub);

PRAGMA foreign_keys = ON;
