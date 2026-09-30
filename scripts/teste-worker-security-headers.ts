import assert from 'node:assert/strict';
import { withSecurityHeaders } from '../worker/src/securityHeaders.js';

const response = withSecurityHeaders(new Response('{"ok":true}', {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
}));

assert.equal(response.status, 200);
assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
assert.equal(response.headers.get('Strict-Transport-Security'), 'max-age=31536000');
assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
assert.equal(response.headers.get('Permissions-Policy'), 'camera=(), microphone=(), geolocation=()');

const preservada = withSecurityHeaders(new Response('ok', { headers: { 'X-Frame-Options': 'SAMEORIGIN' } }));
assert.equal(preservada.headers.get('X-Frame-Options'), 'SAMEORIGIN');

console.log('PASSOU: headers mínimos do Worker são aplicados sem sobrescrever política existente.');
