// Containment check for SECURITY_HARDENING_PROMPT.md §5.B: jwk/iv must
// never appear anywhere except the video's own owner-scoped endpoints.
// Because E2EE is deferred, the server can decrypt any video — this test is
// what makes "an admin can never see decrypted content by accident" a code
// guarantee instead of a hope, and it's meant to keep failing loudly if a
// future endpoint (admin panel included) ever leaks these fields.
const request = require('supertest');
const { app, createUserAndAgent, TEST_ORIGIN } = require('./helpers');

const IV = 'aabbccddeeff00112233445566778899';
const JWK_SECRET_MARKER = 'do-not-leak-this-key-material';
const JWK = JSON.stringify({ kty: 'oct', k: JWK_SECRET_MARKER, alg: 'A256GCM' });

const uploadVideo = async (agent, title = 'Contained Entry') => {
  const presignRes = await agent
    .post('/api/videos/presign')
    .send({ contentType: 'application/octet-stream', contentLength: 17 });

  const uploadPath = new URL(presignRes.body.url).pathname;
  const uploadReq = request(app).post(uploadPath).set('Origin', TEST_ORIGIN);
  Object.entries(presignRes.body.fields).forEach(([field, value]) => uploadReq.field(field, value));
  await uploadReq.attach('file', Buffer.from('encrypted-bytes'), 'encrypted_video.dat');

  return agent.post('/api/videos/finalize').send({ key: presignRes.body.key, iv: IV, jwk: JWK, title });
};

// Every response body is stringified and scanned for the raw key material —
// this catches the field showing up under any name, not just `jwk`/`iv`.
const assertNoKeyMaterial = (res) => {
  const serialized = JSON.stringify(res.body);
  expect(serialized).not.toContain(JWK_SECRET_MARKER);
  expect(serialized).not.toContain(IV);
};

describe('key material containment (jwk/iv)', () => {
  it('IS returned to the video\'s own owner via GET /videos and GET /videos/:id', async () => {
    const { agent } = await createUserAndAgent();
    const upload = await uploadVideo(agent);

    const list = await agent.get('/api/videos');
    expect(JSON.stringify(list.body)).toContain(JWK_SECRET_MARKER);

    const single = await agent.get(`/api/videos/${upload.body.id}`);
    expect(JSON.stringify(single.body)).toContain(JWK_SECRET_MARKER);
  });

  it('is NOT returned to another user who owns nothing', async () => {
    const { agent: owner } = await createUserAndAgent();
    const { agent: stranger } = await createUserAndAgent();
    const upload = await uploadVideo(owner);

    assertNoKeyMaterial(await stranger.get('/api/videos'));
    assertNoKeyMaterial(await stranger.get(`/api/videos/${upload.body.id}`));
  });

  it('never appears in presign, finalize, patch, delete, auth, or profile responses', async () => {
    const { agent } = await createUserAndAgent();
    const upload = await uploadVideo(agent);

    const presign = await agent.post('/api/videos/presign').send({ contentType: 'application/octet-stream', contentLength: 17 });
    assertNoKeyMaterial(presign);

    // The finalize response that just created this exact video's record.
    assertNoKeyMaterial(upload);

    const patch = await agent.patch(`/api/videos/${upload.body.id}`).send({ title: 'Renamed' });
    assertNoKeyMaterial(patch);

    const me = await agent.get('/api/auth/me');
    assertNoKeyMaterial(me);

    const profile = await agent.get('/api/profile');
    assertNoKeyMaterial(profile);

    const del = await agent.delete(`/api/videos/${upload.body.id}`);
    assertNoKeyMaterial(del);
  });

  it('never appears in an error response, even when the request references this video', async () => {
    const { agent } = await createUserAndAgent();
    await uploadVideo(agent);

    // Malformed id -> the generic error path, not the happy path.
    const res = await agent.get('/api/videos/not-a-valid-id');
    assertNoKeyMaterial(res);
  });
});
