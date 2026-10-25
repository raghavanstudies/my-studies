import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resetGoogleKeyCache, verifyGoogleIdToken, GoogleTokenError } from '../src/google-id.js';
import { makeRsaKey, signIdToken, jwksFetch, baseClaims } from './google-token.mjs';

const CLIENT = 'test-client-id.apps.googleusercontent.com';

test('a Google ID token is accepted only with the right signature, audience, issuer and verified email', async () => {
  const { privateKey, jwk } = await makeRsaKey();
  const other = await makeRsaKey('other-key');
  const fetchImpl = jwksFetch(jwk);
  const now = () => Date.now();
  resetGoogleKeyCache();

  const good = await verifyGoogleIdToken(await signIdToken(privateKey, baseClaims()), {
    clientId: CLIENT, fetchImpl, now
  });
  assert.deepEqual(good, { sub: '100000000000000000001', email: 'ada.google@gmail.com', name: 'Ada Lovelace', email_verified: true });

  const iss = await verifyGoogleIdToken(await signIdToken(privateKey, baseClaims({ iss: 'accounts.google.com' })), {
    clientId: CLIENT, fetchImpl, now
  });
  assert.equal(iss.sub, '100000000000000000001');

  const audList = await verifyGoogleIdToken(await signIdToken(privateKey, baseClaims({ aud: [CLIENT, 'other'] })), {
    clientId: CLIENT, fetchImpl, now
  });
  assert.equal(audList.email, 'ada.google@gmail.com');

  async function fails(claims, code, token) {
    resetGoogleKeyCache();
    const value = token || await signIdToken(privateKey, baseClaims(claims));
    await assert.rejects(
      () => verifyGoogleIdToken(value, { clientId: CLIENT, fetchImpl, now }),
      err => err instanceof GoogleTokenError && err.code === code
    );
  }
  await fails({ aud: 'wrong-client.apps.googleusercontent.com' }, 'bad_aud');
  await fails({ iss: 'https://evil.example' }, 'bad_iss');
  await fails({ exp: Math.floor(Date.now() / 1000) - 120 }, 'expired');
  await fails({ email_verified: false }, 'unverified_email');
  await fails({ email: 'not-an-email' }, 'unverified_email');
  await fails({ sub: 'not-numeric' }, 'bad_token');
  await fails({}, 'bad_sig', await signIdToken(other.privateKey, baseClaims(), 'test-key'));
  await fails({}, 'bad_token', 'a.b.c');
  const unsignedClient = await signIdToken(privateKey, baseClaims());
  await assert.rejects(
    () => verifyGoogleIdToken(unsignedClient, { clientId: '', fetchImpl, now }),
    err => err instanceof GoogleTokenError && err.code === 'not_configured'
  );

  resetGoogleKeyCache();
  let calls = 0;
  const flaky = async () => {
    calls += 1;
    if (calls === 1) return new Response('no', { status: 500 });
    return jwksFetch(jwk)();
  };
  const flakyToken = await signIdToken(privateKey, baseClaims());
  await assert.rejects(
    () => verifyGoogleIdToken(flakyToken, { clientId: CLIENT, fetchImpl: flaky, now }),
    err => err instanceof GoogleTokenError && err.code === 'jwks'
  );
});
