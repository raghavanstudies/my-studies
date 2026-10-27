-- Account features for an EXISTING shop database: orders on the account,
-- saved addresses, the pregnancy tracker copy, and one login per device.
-- Run once, after db/auth-migration-004.sql:
--   npx wrangler d1 execute peppynose_shop --remote --file=db/auth-migration-005.sql
--
-- Adds columns and tables only. Nothing is dropped or copied. Old orders stay
-- without an account (user_id NULL). Old logins show as "Unknown device".
-- SQLite cannot add a column with IF NOT EXISTS. A second run stops at the
-- first ALTER with "duplicate column name" and changes nothing.
-- Skip this file if the database was created from the current schema.sql.

ALTER TABLE orders ADD COLUMN user_id TEXT;
ALTER TABLE sessions ADD COLUMN device TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS orders_user ON orders(user_id, created_at);

CREATE TABLE IF NOT EXISTS addresses (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  data       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  used_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS addresses_user ON addresses(user_id, used_at);

CREATE TABLE IF NOT EXISTS tracker_data (
  user_id    TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
