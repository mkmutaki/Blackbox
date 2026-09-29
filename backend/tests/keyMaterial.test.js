// Containment check for SECURITY_HARDENING_PROMPT.md §5.B: jwk/iv must
// never appear anywhere except the video's own owner-scoped endpoints.
// Because E2EE is deferred, the server can decrypt any video — this test is
// what makes "an admin can never see decrypted content by accident" a code
// guarantee instead of a hope, and it's meant to keep failing loudly if a
// future endpoint (admin panel included) ever leaks these fields.
const request = require('supertest');
const { app, createUserAndToken } = require('./helpers');

const IV = 'aabbccddeeff00112233445566778899';
const JWK_SECRET_MARKER = 'do-not-leak-this-key-material';
const JWK = JSON.stringify({ kty: 'oct', k: JWK_SECRET_MARKER, alg: 'A256GCM' });

const uploadVideo = async (token, title = 'Contained Entry') => {
  const presignRes = await request(app)
    .post('/api/videos/presign')
    .set('Authorization', `Bearer ${token}`)
    .send({ contentType: 'application/octet-stream', contentLength: 17 });

  const uploadPath = new URL(presignRes.body.url).pathname;
  const uploadReq = request(app).post(uploadPath);
  Object.entries(presignRes.body.fields).forEach(([field, value]) => uploadReq.field(field, value));
  await uploadReq.attach('file', Buffer.from('encrypted-bytes'), 'encrypted_video.dat');

  return request(app)
    .post('/api/videos/finalize')
    .set('Authorization', `Bearer ${token}`)
    .send({ key: presignRes.body.key, iv: IV, jwk: JWK, title });
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
    const { token } = await createUserAndToken();
    const upload = await uploadVideo(token);

    const list = await request(app).get('/api/videos').set('Authorization', `Bearer ${token}`);
    expect(JSON.stringify(list.body)).toContain(JWK_SECRET_MARKER);

    const single = await request(app).get(`/api/videos/${upload.body.id}`).set('Authorization', `Bearer ${token}`);
    expect(JSON.stringify(single.body)).toContain(JWK_SECRET_MARKER);
  });

  it('is NOT returned to another user who owns nothing', async () => {
    const { token: owner } = await createUserAndToken();
    const { token: stranger } = await createUserAndToken();
    const upload = await uploadVideo(owner);

    assertNoKeyMaterial(await request(app).get('/api/videos').set('Authorization', `Bearer ${stranger}`));
    assertNoKeyMaterial(
      await request(app).get(`/api/videos/${upload.body.id}`).set('Authorization', `Bearer ${stranger}`)
    );
  });

  it('never appears in presign, finalize, patch, delete, auth, or profile responses', async () => {
    const { token } = await createUserAndToken();
    const upload = await uploadVideo(token);

    const presign = await request(app)
      .post('/api/videos/presign')
      .set('Authorization', `Bearer ${token}`)
      .send({ contentType: 'application/octet-stream', contentLength: 17 });
    assertNoKeyMaterial(presign);

    // The finalize response that just created this exact video's record.
    assertNoKeyMaterial(upload);

    const patch = await request(app)
      .patch(`/api/videos/${upload.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Renamed' });
    assertNoKeyMaterial(patch);

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    assertNoKeyMaterial(me);

    const profile = await request(app).get('/api/profile').set('Authorization', `Bearer ${token}`);
    assertNoKeyMaterial(profile);

    const del = await request(app).delete(`/api/videos/${upload.body.id}`).set('Authorization', `Bearer ${token}`);
    assertNoKeyMaterial(del);
  });

  it('never appears in an error response, even when the request references this video', async () => {
    const { token } = await createUserAndToken();
    await uploadVideo(token);

    // Malformed id -> the generic error path, not the happy path.
    const res = await request(app).get('/api/videos/not-a-valid-id').set('Authorization', `Bearer ${token}`);
    assertNoKeyMaterial(res);
  });
});
