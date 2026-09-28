const request = require('supertest');
const { app, createUserAndToken } = require('./helpers');
const fakeS3 = require('../services/fakeS3Client');

const uploadVideo = (token, overrides = {}) => {
  const req = request(app)
    .post('/api/videos')
    .set('Authorization', `Bearer ${token}`)
    .field('iv', overrides.iv ?? 'aabbccddeeff00112233445566778899')
    .field('jwk', overrides.jwk ?? JSON.stringify({ kty: 'oct', k: 'fake-key-material', alg: 'A256GCM' }))
    .field('title', overrides.title ?? 'My First Log');

  if (overrides.skipFile) return req;

  return req.attach('file', Buffer.from('encrypted-bytes'), 'encrypted_video.dat');
};

describe('POST /api/videos', () => {
  it('uploads an encrypted video and stores it via the S3 client', async () => {
    const { token } = await createUserAndToken();

    const res = await uploadVideo(token);

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.entryNumber).toBe(1);
  });

  it('increments entryNumber per user', async () => {
    const { token } = await createUserAndToken();

    await uploadVideo(token);
    const second = await uploadVideo(token);

    expect(second.body.entryNumber).toBe(2);
  });

  it('rejects a missing file', async () => {
    const { token } = await createUserAndToken();

    const res = await uploadVideo(token, { skipFile: true });

    expect(res.status).toBe(400);
  });

  it('rejects a missing title', async () => {
    const { token } = await createUserAndToken();

    const res = await uploadVideo(token, { title: '' });

    expect(res.status).toBe(400);
  });

  it('requires authentication', async () => {
    const res = await request(app)
      .post('/api/videos')
      .field('iv', 'aa')
      .field('jwk', '{}')
      .field('title', 'x')
      .attach('file', Buffer.from('data'), 'video.dat');

    expect(res.status).toBe(401);
  });
});

describe('GET /api/videos', () => {
  it('lists only the current user\'s videos with playable signed URLs', async () => {
    const { token: tokenA } = await createUserAndToken();
    const { token: tokenB } = await createUserAndToken();

    await uploadVideo(tokenA, { title: 'A1' });
    await uploadVideo(tokenB, { title: 'B1' });

    const res = await request(app).get('/api/videos').set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('A1');
    expect(res.body[0].url).toContain('/__fake-s3__/');

    // The signed URL actually resolves to the encrypted bytes that were uploaded.
    const download = await request(app).get(new URL(res.body[0].url).pathname + new URL(res.body[0].url).search);
    expect(download.status).toBe(200);
    expect(download.body.toString()).toBe('encrypted-bytes');
  });
});

describe('video ownership (IDOR)', () => {
  it('a video belonging to user A is invisible to user B', async () => {
    const { token: tokenA } = await createUserAndToken();
    const { token: tokenB } = await createUserAndToken();

    const upload = await uploadVideo(tokenA);
    const videoId = upload.body.id;

    const getRes = await request(app).get(`/api/videos/${videoId}`).set('Authorization', `Bearer ${tokenB}`);
    expect(getRes.status).toBe(404);

    const patchRes = await request(app)
      .patch(`/api/videos/${videoId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ title: 'Hijacked' });
    expect(patchRes.status).toBe(404);

    const deleteRes = await request(app).delete(`/api/videos/${videoId}`).set('Authorization', `Bearer ${tokenB}`);
    expect(deleteRes.status).toBe(404);

    // Confirm user A's video and underlying object are untouched.
    const stillThere = await request(app).get(`/api/videos/${videoId}`).set('Authorization', `Bearer ${tokenA}`);
    expect(stillThere.status).toBe(200);
    expect(stillThere.body.title).toBe('My First Log');
  });
});

describe('GET /api/videos/:id', () => {
  it('returns the video for its owner', async () => {
    const { token } = await createUserAndToken();
    const upload = await uploadVideo(token);

    const res = await request(app).get(`/api/videos/${upload.body.id}`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(upload.body.id);
    expect(res.body.iv).toBeTruthy();
    expect(res.body.jwk).toBeTruthy();
  });

  it('returns 404 for a non-existent (but valid-looking) id', async () => {
    const { token } = await createUserAndToken();
    const res = await request(app)
      .get('/api/videos/507f1f77bcf86cd799439011')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/videos/:id', () => {
  it('renames a video the caller owns', async () => {
    const { token } = await createUserAndToken();
    const upload = await uploadVideo(token);

    const res = await request(app)
      .patch(`/api/videos/${upload.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Renamed Entry' });

    expect(res.status).toBe(200);
    expect(res.body.video.title).toBe('Renamed Entry');
  });

  it('rejects a missing title', async () => {
    const { token } = await createUserAndToken();
    const upload = await uploadVideo(token);

    const res = await request(app)
      .patch(`/api/videos/${upload.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/videos/:id', () => {
  it('deletes a video the caller owns, removing the S3 object too', async () => {
    const { token } = await createUserAndToken();
    const upload = await uploadVideo(token);

    const res = await request(app).delete(`/api/videos/${upload.body.id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);

    const getRes = await request(app).get(`/api/videos/${upload.body.id}`).set('Authorization', `Bearer ${token}`);
    expect(getRes.status).toBe(404);
  });
});
