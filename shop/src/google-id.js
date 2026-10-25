// Verify a Google Identity Services ID token (RS256) with Google's public JWKS.
// The Worker never trusts the browser's copy of the name or email. Callers must
// still check aud against GOOGLE_CLIENT_ID.

const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const KEY_TTL_MS = 10 * 60 * 1000;
const CLOCK_SKEW_SEC = 60;

export class GoogleTokenError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const keyCache = { url: '', at: 0, keys: [] };

export function resetGoogleKeyCache() {
  keyCache.url = '';
  keyCache.at = 0;
  keyCache.keys = [];
}

function b64urlToBytes(part) {
  if (typeof part !== 'string' || !part || /[^A-Za-z0-9_-]/.test(part)) return null;
  const pad = part.length % 4 === 0 ? '' : '='.repeat(4 - (part.length % 4));
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/') + pad;
  let bin = '';
  try { bin = atob(b64); } catch { return null; }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function readJson(bytes) {
  if (!bytes) return null;
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { return null; }
}

async function fetchKeys(fetchImpl, url, force) {
  if (!force && keyCache.url === url && keyCache.keys.length && Date.now() - keyCache.at < KEY_TTL_MS) return keyCache.keys;
  let res;
  try {
    res = await fetchImpl(url, { headers: { accept: 'application/json' } });
  } catch {
    throw new GoogleTokenError('jwks');
  }
  if (!res || !res.ok) throw new GoogleTokenError('jwks');
  let body;
  try { body = await res.json(); } catch { throw new GoogleTokenError('jwks'); }
  if (!body || !Array.isArray(body.keys)) throw new GoogleTokenError('jwks');
  keyCache.url = url;
  keyCache.at = Date.now();
  keyCache.keys = body.keys;
  return keyCache.keys;
}

function audMatches(aud, clientId) {
  if (aud === clientId) return true;
  return Array.isArray(aud) && aud.includes(clientId);
}

// options.fetchImpl, options.now (ms), options.jwksUrl are for tests.
export async function verifyGoogleIdToken(token, options = {}) {
  const clientId = String(options.clientId || '');
  if (!clientId) throw new GoogleTokenError('not_configured');
  if (typeof token !== 'string' || token.length < 20 || token.length > 5000) throw new GoogleTokenError('bad_token');
  const parts = token.split('.');
  if (parts.length !== 3) throw new GoogleTokenError('bad_token');
  const header = readJson(b64urlToBytes(parts[0]));
  const payloadBytes = b64urlToBytes(parts[1]);
  const sig = b64urlToBytes(parts[2]);
  const payload = readJson(payloadBytes);
  if (!header || !payload || !sig) throw new GoogleTokenError('bad_token');
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(header.kid)) {
    throw new GoogleTokenError('bad_token');
  }

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const url = options.jwksUrl || JWKS_URL;
  let keys = await fetchKeys(fetchImpl, url, false);
  let jwk = keys.find(k => k && k.kid === header.kid && k.kty === 'RSA' && k.n && k.e);
  if (!jwk) {
    keys = await fetchKeys(fetchImpl, url, true);
    jwk = keys.find(k => k && k.kid === header.kid && k.kty === 'RSA' && k.n && k.e);
  }
  if (!jwk) throw new GoogleTokenError('bad_token');

  let key;
  try {
    key = await crypto.subtle.importKey(
      'jwk',
      { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
  } catch {
    throw new GoogleTokenError('bad_token');
  }
  const data = new TextEncoder().encode(parts[0] + '.' + parts[1]);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, data);
  if (!ok) throw new GoogleTokenError('bad_sig');

  const iss = payload.iss;
  if (iss !== 'https://accounts.google.com' && iss !== 'accounts.google.com') throw new GoogleTokenError('bad_iss');
  if (!audMatches(payload.aud, clientId)) throw new GoogleTokenError('bad_aud');
  const now = Math.floor((typeof options.now === 'function' ? options.now() : Date.now()) / 1000);
  if (typeof payload.exp !== 'number' || now > payload.exp + CLOCK_SKEW_SEC) throw new GoogleTokenError('expired');
  if (typeof payload.nbf === 'number' && now + CLOCK_SKEW_SEC < payload.nbf) throw new GoogleTokenError('expired');
  if (payload.email_verified !== true && payload.email_verified !== 'true') throw new GoogleTokenError('unverified_email');
  if (typeof payload.sub !== 'string' || !/^[0-9]{1,255}$/.test(payload.sub)) throw new GoogleTokenError('bad_token');
  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email) || email.includes('..') || email.startsWith('.') || email.includes('.@')) {
    throw new GoogleTokenError('unverified_email');
  }
  const name = typeof payload.name === 'string' ? payload.name.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  return { sub: payload.sub, email, name, email_verified: true };
}
