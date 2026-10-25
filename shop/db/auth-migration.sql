-- Add customer accounts to an EXISTING shop database.
-- Safe to run more than once. Does not delete products, orders, or the admin login_attempts table.
-- Do NOT run schema.sql on a live database: that file drops every shop table.
-- Local `npm run dev` already loads schema.sql into an empty test database; you do not need this file locally.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  csrf       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id, expires_at);

CREATE TABLE IF NOT EXISTS auth_attempts (
  scope TEXT NOT NULL,
  key   TEXT NOT NULL,
  at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_attempts_lookup ON auth_attempts(scope, key, at);
