// Pluggable delivery for login codes. The default provider is "dev": it does not
// contact any SMS or email service, and it may return the code to the caller for
// local tests. Dev mode is refused when the request is for peppynose.com, so a
// Worker left on the default cannot reveal codes on the live site.
// This module does not sign up for a provider. Live providers run only when the
// owner sets that provider's secrets (see shop/README.md).

const LIVE_HOST = /(^|\.)peppynose\.com$/i;

function hostnameOf(value) {
  if (!value) return '';
  const raw = String(value).split(',')[0].trim();
  try {
    if (raw.includes('://')) return new URL(raw).hostname.toLowerCase();
  } catch { return ''; }
  return raw.replace(/:\d+$/, '').toLowerCase();
}

export function isLiveRequest(req) {
  let urlHost = '';
  try { urlHost = new URL(req.url).hostname.toLowerCase(); } catch { urlHost = ''; }
  return [urlHost, hostnameOf(req.headers.get('origin')), hostnameOf(req.headers.get('host'))]
    .some(host => LIVE_HOST.test(host));
}

export function providerFor(env, channel) {
  const raw = channel === 'sms' ? env && env.OTP_SMS_PROVIDER : env && env.OTP_EMAIL_PROVIDER;
  return String(raw || 'dev').trim().toLowerCase();
}

function missing(env, names) {
  return names.filter(name => typeof env[name] !== 'string' || env[name].trim() === '');
}

// Checks configuration only. Does not send and does not look up an account.
export function deliveryReady(env, channel, req) {
  const provider = providerFor(env, channel);
  if (provider === 'dev') {
    if (isLiveRequest(req)) return { ok: false, reason: 'dev_refused' };
    return { ok: true, provider, dev: true };
  }
  const need = {
    msg91: ['MSG91_AUTH_KEY', 'MSG91_TEMPLATE_ID', 'MSG91_SENDER_ID'],
    twilio: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM'],
    resend: ['RESEND_API_KEY', 'OTP_EMAIL_FROM'],
    mailchannels: ['OTP_EMAIL_FROM'],
    ses: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SES_REGION', 'OTP_EMAIL_FROM']
  }[provider];
  if (!need) return { ok: false, reason: 'unknown_provider' };
  if (channel === 'sms' && provider !== 'msg91' && provider !== 'twilio') return { ok: false, reason: 'unknown_provider' };
  if (channel === 'email' && provider !== 'resend' && provider !== 'mailchannels' && provider !== 'ses') return { ok: false, reason: 'unknown_provider' };
  const absent = missing(env, need);
  if (absent.length) return { ok: false, reason: 'missing_secret', missing: absent };
  return { ok: true, provider, dev: false };
}

const smsText = code => `Your Peppynose login code is ${code}. It expires in 5 minutes.`;
const emailText = code => `Your Peppynose login code is ${code}. It expires in 5 minutes. If you did not ask for this, you can ignore this message.`;

async function postJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) return { ok: false, reason: 'provider_error' };
  return { ok: true };
}

async function sendMsg91(env, mobile, code) {
  return postJson('https://control.msg91.com/api/v5/otp', {
    method: 'POST',
    headers: { authkey: env.MSG91_AUTH_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      template_id: env.MSG91_TEMPLATE_ID,
      mobile: '91' + mobile,
      sender: env.MSG91_SENDER_ID,
      otp: code
    })
  });
}

async function sendTwilio(env, mobile, code) {
  const body = new URLSearchParams({
    To: '+91' + mobile,
    From: env.TWILIO_FROM,
    Body: env.TWILIO_OTP_BODY ? String(env.TWILIO_OTP_BODY).replaceAll('{code}', code) : smsText(code)
  });
  const token = btoa(env.TWILIO_ACCOUNT_SID + ':' + env.TWILIO_AUTH_TOKEN);
  return postJson(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(env.TWILIO_ACCOUNT_SID)}/Messages.json`, {
    method: 'POST',
    headers: { authorization: 'Basic ' + token, 'content-type': 'application/x-www-form-urlencoded' },
    body
  });
}

async function sendResend(env, email, code) {
  return postJson('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + env.RESEND_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: env.OTP_EMAIL_FROM,
      to: [email],
      subject: 'Your Peppynose login code',
      text: emailText(code)
    })
  });
}

async function sendMailChannels(env, email, code) {
  return postJson('https://api.mailchannels.net/tx/v1/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email }] }],
      from: { email: env.OTP_EMAIL_FROM, name: 'Peppynose' },
      subject: 'Your Peppynose login code',
      content: [{ type: 'text/plain', value: emailText(code) }]
    })
  });
}

async function hmacHex(keyBytes, data) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, data);
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(data) {
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// SES SendEmail, query API, signature version 4. Used only when AWS secrets are set.
async function sendSes(env, email, code) {
  const region = env.AWS_SES_REGION.trim();
  const service = 'ses';
  const host = `email.${region}.amazonaws.com`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = amzDate.slice(0, 8);
  const body = new URLSearchParams({
    Action: 'SendEmail',
    Version: '2010-12-01',
    Source: env.OTP_EMAIL_FROM,
    'Destination.ToAddresses.member.1': email,
    'Message.Subject.Data': 'Your Peppynose login code',
    'Message.Body.Text.Data': emailText(code)
  }).toString();
  const enc = new TextEncoder();
  const payloadHash = await sha256Hex(enc.encode(body));
  const canonical = [
    'POST', '/', '',
    'content-type:application/x-www-form-urlencoded',
    'host:' + host,
    'x-amz-date:' + amzDate,
    '',
    'content-type;host;x-amz-date',
    payloadHash
  ].join('\n');
  const scope = `${date}/${region}/${service}/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${await sha256Hex(enc.encode(canonical))}`;
  const kDate = await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', enc.encode('AWS4' + env.AWS_SECRET_ACCESS_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), enc.encode(date));
  const kRegion = await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', kDate, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), enc.encode(region));
  const kService = await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', kRegion, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), enc.encode(service));
  const kSign = await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', kService, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), enc.encode('aws4_request'));
  const signature = await hmacHex(kSign, enc.encode(stringToSign));
  const authorization = `AWS4-HMAC-SHA256 Credential=${env.AWS_ACCESS_KEY_ID}/${scope}, SignedHeaders=content-type;host;x-amz-date, Signature=${signature}`;
  return postJson('https://' + host + '/', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      host,
      'x-amz-date': amzDate,
      authorization
    },
    body
  });
}

export async function sendOtp({ channel, to, code, env }) {
  const provider = providerFor(env, channel);
  if (provider === 'dev') return { ok: true, dev: true };
  if (provider === 'msg91') return sendMsg91(env, to, code);
  if (provider === 'twilio') return sendTwilio(env, to, code);
  if (provider === 'resend') return sendResend(env, to, code);
  if (provider === 'mailchannels') return sendMailChannels(env, to, code);
  if (provider === 'ses') return sendSes(env, to, code);
  return { ok: false, reason: 'unknown_provider' };
}
