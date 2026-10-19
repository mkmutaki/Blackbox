// Shared tooling for the Phase 4 adversarial tests
// (SECURITY_HARDENING_PROMPT.md §7). Everything here talks to the real
// Express app in-process, against the in-memory database and fake S3 from
// tests/setup.js — never a running server, never real data.
const util = require('node:util');
const request = require('supertest');
const { app, TEST_ORIGIN } = require('../helpers');

const IV = 'a1b2c3d4e5f60718293a4b5c';
const JWK = JSON.stringify({ kty: 'oct', k: 'adversarial-test-key', alg: 'A256GCM' });

// presign -> direct upload to the (fake) storage target, the first two
// steps VideoRecorder.tsx performs. Returns the server-generated key.
const presignAndUpload = async (agent) => {
  const presignRes = await agent.post('/api/videos/presign').send({});
  const uploadReq = request(app).post(new URL(presignRes.body.url).pathname).set('Origin', TEST_ORIGIN);
  Object.entries(presignRes.body.fields).forEach(([field, value]) => uploadReq.field(field, value));
  await uploadReq.attach('file', Buffer.from('ciphertext-bytes'), 'blob.dat');
  return presignRes.body.key;
};

const finalize = (agent, key, overrides = {}) =>
  agent.post('/api/videos/finalize').send({ key, iv: IV, jwk: JWK, title: 'Entry', ...overrides });

// Raw cookie value from a response's Set-Cookie headers.
const cookieFrom = (res, name) => {
  const header = (res.headers['set-cookie'] || []).find((c) => c.startsWith(`${name}=`));
  return header ? header.split(';')[0].slice(name.length + 1) : undefined;
};

// Temporarily overrides env vars around fn, restoring them even if it throws.
const withEnv = async (vars, fn) => {
  const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  Object.assign(process.env, vars);
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
};

// Captures everything written through console.* as it would reach a log
// aggregator (util.format renders Error objects with message and stack).
const captureConsole = () => {
  const lines = [];
  const spies = ['log', 'info', 'warn', 'error', 'debug'].map((method) =>
    vi.spyOn(console, method).mockImplementation((...args) => { lines.push(util.format(...args)); }));
  return {
    text: () => lines.join('\n'),
    restore: () => spies.forEach((s) => s.mockRestore()),
  };
};

module.exports = { IV, JWK, presignAndUpload, finalize, cookieFrom, withEnv, captureConsole };
