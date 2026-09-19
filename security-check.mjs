import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./script.js', import.meta.url), 'utf8');
const headers = await readFile(new URL('./_headers', import.meta.url), 'utf8');
const required = [
  ['credentialed fetch', /credentials: 'include'/],
  ['server-verified Turnstile token submission', /turnstileToken/],
  ['short-lived join ticket flow', /\/api\/rooms\/\$\{roomCode\}\/join-ticket/],
  ['strict CSP', /Content-Security-Policy:.*frame-ancestors 'none'/s],
  ['Turnstile teardown after auth requests', /destroyTurnstileWidget/],
  ['Turnstile widget removal', /turnstile\.remove/],
  ['stale WebSocket attempt tracking', /connectionAttempt/],
  ['stale WebSocket event guard', /socket !== ws \|\| attempt !== connectionAttempt/],
];
for (const [label, pattern] of required) {
  if (!pattern.test(source + '\n' + headers)) throw new Error(`Missing security control: ${label}`);
}
const forbidden = [
  ['JavaScript session bearer state', /sessionToken/],
  ['JavaScript session bearer header', /X-Session-Token/],
  ['Turnstile auto-submit retry', /authSubmitBtn\.click\(\)/],
  ['private key material', /-----BEGIN (?:RSA|OPENSSH|EC) PRIVATE KEY-----/],
];
for (const [label, pattern] of forbidden) {
  if (pattern.test(source)) throw new Error(`Forbidden security regression: ${label}`);
}
console.log('Frontend security checks passed.');
