-- Add username, mobile, and one-time login codes to an EXISTING shop database.
-- Additive only: ALTER TABLE and CREATE ... IF NOT EXISTS. Does not drop or rebuild any table.
-- Safe for orders, products, and existing account rows (those rows keep NULL username and mobile until the person signs up again).
--
-- Run once, after db/auth-migration.sql:
--   npx wrangler d1 execute peppynose_shop --remote --file=db/auth-migration-002.sql
--
-- SQLite has no ADD COLUMN IF NOT EXISTS. Running the two ALTER lines a second time
-- stops with "duplicate column name" and does not delete anything. The CREATE INDEX
-- and CREATE TABLE lines are safe to repeat.
-- Do not run this on a database created from the current db/schema.sql: that file
-- already has these columns and auth_otps. Do not run schema.sql on a live database.

ALTER TABLE users ADD COLUMN username TEXT;
ALTER TABLE users ADD COLUMN mobile TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS users_username ON users(username COLLATE NOCASE);
CREATE UNIQUE INDEX IF NOT EXISTS users_mobile ON users(mobile);

CREATE TABLE IF NOT EXISTS auth_otps (
  id          TEXT PRIMARY KEY,
  identifier  TEXT NOT NULL,
  code_hash   TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  used        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_otps_lookup ON auth_otps(identifier, created_at);
