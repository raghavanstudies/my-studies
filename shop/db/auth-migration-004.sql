-- Mark which account emails are verified, for an EXISTING shop database.
-- Run once, after db/auth-migration-003.sql:
--   npx wrangler d1 execute peppynose_shop --remote --file=db/auth-migration-004.sql
--
-- Adds one column. Nothing is dropped or copied. Every existing email starts as
-- unverified (0), because the details form never proved who owns it. A Google
-- account keeps signing in by its Google id either way. New Google accounts are
-- written with 1 by the Worker.
-- SQLite cannot add a column with IF NOT EXISTS. A second run stops with
-- "duplicate column name" and changes nothing.
-- Skip this file if the database was created from the current schema.sql.

ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;
