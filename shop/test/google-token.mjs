// Test-only RS256 ID tokens. Not used by the Worker.

export async function makeRsaKey(kid = 'test-key') {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify']
  );
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  jwk.kid = kid;
  jwk.alg = 'RS256';
  jwk.use = 'sig';
  return { privateKey: pair.privateKey, jwk };
}

function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function signIdToken(privateKey, claims, kid = 'test-key') {
  const enc = new TextEncoder();
  const header = b64url(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid })));
  const payload = b64url(enc.encode(JSON.stringify(claims)));
  const data = enc.encode(header + '.' + payload);
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, data));
  return header + '.' + payload + '.' + b64url(sig);
}

export function jwksFetch(jwk) {
  return async () => new Response(JSON.stringify({ keys: [jwk] }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

export function baseClaims(over = {}) {
  return {
    iss: 'https://accounts.google.com',
    aud: 'test-client-id.apps.googleusercontent.com',
    sub: '100000000000000000001',
    email: 'ada.google@gmail.com',
    email_verified: true,
    name: 'Ada Lovelace',
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...over
  };
}
