-- Peppynose own shop: database schema (Cloudflare D1 / SQLite).
-- Money is always stored in paise (₹1 = 100). Prices include GST, as shown to customers.
DROP TABLE IF EXISTS auth_otps;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS auth_attempts;
DROP TABLE IF EXISTS outbox;
DROP TABLE IF EXISTS order_events;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS variants;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS settings;
DROP TABLE IF EXISTS login_attempts;

CREATE TABLE products (
  slug          TEXT PRIMARY KEY,
  category      TEXT NOT NULL,
  data          TEXT NOT NULL,              -- JSON: name / desc / alt in en, ta, hi; image
  gst_rate      REAL NOT NULL,              -- percent, e.g. 18
  hsn           TEXT NOT NULL DEFAULT '',
  gst_confirmed INTEGER NOT NULL DEFAULT 0, -- 1 once the CA has confirmed rate + HSN
  active        INTEGER NOT NULL DEFAULT 1,
  sort          INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE variants (
  sku          TEXT PRIMARY KEY,
  product_slug TEXT NOT NULL REFERENCES products(slug),
  label        TEXT NOT NULL,               -- JSON: en, ta, hi
  price        INTEGER NOT NULL CHECK (price > 0),
  stock        INTEGER NOT NULL CHECK (stock >= 0),   -- a sale can never take stock below 0
  mrp          INTEGER,                    -- printed MRP in paise (NULL = not known yet); price can never be above it
  net_qty      TEXT NOT NULL DEFAULT '',
  weight_g     INTEGER NOT NULL DEFAULT 0,
  amazon       TEXT,
  flipkart     TEXT,
  sort         INTEGER NOT NULL DEFAULT 0,
  CHECK (mrp IS NULL OR price <= mrp)
);

CREATE TABLE orders (
  id             TEXT PRIMARY KEY,          -- random, never guessable
  number         INTEGER NOT NULL UNIQUE,   -- shown to people: PN-1001, PN-1002 …
  token          TEXT NOT NULL,             -- secret in the customer's order link
  status         TEXT NOT NULL,             -- pending_payment, paid, paid_review, packed, shipped, delivered, payment_failed, cancelled, refunded
  lang           TEXT NOT NULL DEFAULT 'en',
  created_at     TEXT NOT NULL,
  paid_at        TEXT,
  customer       TEXT NOT NULL,             -- JSON: name, phone, email, address1, address2, city, state, pincode
  state          TEXT NOT NULL,             -- delivery state (decides CGST+SGST or IGST)
  subtotal       INTEGER NOT NULL,
  shipping       INTEGER NOT NULL,
  total          INTEGER NOT NULL,
  payment_mode   TEXT NOT NULL,             -- mock | razorpay
  gateway_order  TEXT,                      -- Razorpay order id
  payment_ref    TEXT,                      -- payment id from the gateway
  finalize_nonce TEXT,                      -- makes "mark as paid + take stock" happen exactly once
  tracking       TEXT,
  admin_note     TEXT
);
CREATE INDEX orders_status ON orders(status, created_at);

CREATE TABLE order_items (
  order_id   TEXT NOT NULL REFERENCES orders(id),
  sku        TEXT NOT NULL,
  name       TEXT NOT NULL,                 -- copied at order time, so later edits never change old invoices
  label      TEXT NOT NULL,
  qty        INTEGER NOT NULL CHECK (qty > 0),
  unit_price INTEGER NOT NULL,
  gst_rate   REAL NOT NULL,
  hsn        TEXT NOT NULL
);

CREATE TABLE order_events (
  order_id TEXT NOT NULL,
  at       TEXT NOT NULL,
  status   TEXT NOT NULL,
  note     TEXT
);

-- Messages waiting to be sent (email / SMS). Locally they are only stored and shown in the admin page.
CREATE TABLE outbox (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   TEXT,
  kind       TEXT NOT NULL,
  to_addr    TEXT NOT NULL,
  subject    TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sent_at    TEXT
);

CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE login_attempts (ip TEXT NOT NULL, at TEXT NOT NULL);

-- Customer accounts (separate from the shop admin password).
-- password_hash is PBKDF2-SHA256, never the password itself. It is empty for a
-- Google-only account. email, name and mobile stay empty until "Your details".
-- This file is for a fresh local database only. A live database uses
-- auth-migration.sql, auth-migration-002.sql and auth-migration-003.sql.
CREATE TABLE users (
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

-- id is the SHA-256 of the cookie value, so a database copy does not reveal live cookies.
CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  csrf       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id, expires_at);

-- Failed customer logins and sign-up attempts. Admin lockouts stay in login_attempts.
CREATE TABLE auth_attempts (
  scope TEXT NOT NULL,
  key   TEXT NOT NULL,
  at    TEXT NOT NULL
);
CREATE INDEX auth_attempts_lookup ON auth_attempts(scope, key, at);

-- One-time login codes. code_hash is an HMAC of the code, never the code itself.
CREATE TABLE auth_otps (
  id          TEXT PRIMARY KEY,
  identifier  TEXT NOT NULL,
  code_hash   TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  used        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
CREATE INDEX auth_otps_lookup ON auth_otps(identifier, created_at);
