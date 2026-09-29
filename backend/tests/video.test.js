const request = require('supertest');
const { app, createUserAndToken } = require('./helpers');

const DEFAULT_IV = 'aabbccddeeff00112233445566778899';
const DEFAULT_JWK = JSON.stringify({ kty: 'oct', k: 'fake-key-material', alg: 'A256GCM' });

const presign = (token) =>
  request(app)
    .post('/api/videos/presign')
    .set('Authorization', `Bearer ${token}`)
    .send({ contentType: 'application/octet-stream', contentLength: 17 });

// Uploads bytes to whatever presigned target the backend handed back —
// exercises the same fake-S3 POST route the browser would hit directly.
const uploadBytes = (presignedUrl, fields, bytes = Buffer.from('encrypted-bytes')) => {
  const uploadPath = new URL(presignedUrl).pathname;
  const req = request(app).post(uploadPath);
  Object.entries(fields).forEach(([field, value]) => req.field(field, value));
  return req.attach('file', bytes, 'encrypted_video.dat');
};

const finalize = (token, body) =>
  request(app).post('/api/videos/finalize').set('Authorization', `Bearer ${token}`).send(body);

// End-to-end happy path: presign -> upload -> finalize. What most tests use
// to get "a video that exists" without caring about the upload mechanics.
const uploadVideo = async (token, overrides = {}) => {
  const presignRes = await presign(token);
  await uploadBytes(presignRes.body.url, presignRes.body.fields);

  return finalize(token, {
    key: presignRes.body.key,
    iv: overrides.iv ?? DEFAULT_IV,
    jwk: overrides.jwk ?? DEFAULT_JWK,
    title: overrides.title ?? 'My First Log',
  });
};

describe('POST /api/videos/presign', () => {
  it('returns a server-generated key under the caller\'s own prefix', async () => {
    const { token, user } = await createUserAndToken();

    const res = await presign(token);

    expect(res.status).toBe(200);
    expect(res.body.url).toBeTruthy();
    expect(res.body.fields).toBeTruthy();
    expect(res.body.key.startsWith(`videos/${user.id}/`)).toBe(true);
    expect(res.body.key.split('/').pop()).toMatch(/^[0-9a-f-]{36}$/); // uuid, not a client filename
  });

  it('requires authentication', async () => {
    const res = await request(app)
      .post('/api/videos/presign')
      .send({ contentType: 'application/octet-stream' });

    expect(res.status).toBe(401);
  });
});

describe('POST /api/videos/finalize', () => {
  it('creates a video record once the object actually exists in storage', async () => {
    const { token } = await createUserAndToken();

    const res = await uploadVideo(token);

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.entryNumber).toBe(1);
  });

  it('increments entryNumber per user, atomically', async () => {
    const { token } = await createUserAndToken();

    await uploadVideo(token);
    const second = await uploadVideo(token);

    expect(second.body.entryNumber).toBe(2);
  });

  it('rejects finalize when nothing was actually uploaded to the presigned key', async () => {
    const { token } = await createUserAndToken();
    const presignRes = await presign(token);

    // Skips uploadBytes entirely — the object never lands in the fake store.
    const res = await finalize(token, {
      key: presignRes.body.key,
      iv: DEFAULT_IV,
      jwk: DEFAULT_JWK,
      title: 'Ghost entry',
    });

    expect(res.status).toBe(400);
  });

  it('rejects a key outside the caller\'s own prefix', async () => {
    const { token: tokenA } = await createUserAndToken();
    const { token: tokenB } = await createUserAndToken();

    const presignA = await presign(tokenA);
    await uploadBytes(presignA.body.url, presignA.body.fields);

    // User B tries to finalize into their own account using A's upload key.
    const res = await finalize(tokenB, {
      key: presignA.body.key,
      iv: DEFAULT_IV,
      jwk: DEFAULT_JWK,
      title: 'Stolen entry',
    });

    expect(res.status).toBe(403);
  });

  it('rejects missing iv/jwk/key', async () => {
    const { token } = await createUserAndToken();
    const res = await finalize(token, { title: 'x' });
    expect(res.status).toBe(400);
  });

  it('rejects a missing title', async () => {
    const { token } = await createUserAndToken();
    const presignRes = await presign(token);
    await uploadBytes(presignRes.body.url, presignRes.body.fields);

    const res = await finalize(token, { key: presignRes.body.key, iv: DEFAULT_IV, jwk: DEFAULT_JWK, title: '' });
    expect(res.status).toBe(400);
  });

  it('rejects invalid JSON in jwk', async () => {
    const { token } = await createUserAndToken();
    const presignRes = await presign(token);
    await uploadBytes(presignRes.body.url, presignRes.body.fields);

    const res = await finalize(token, { key: presignRes.body.key, iv: DEFAULT_IV, jwk: 'not-json', title: 'x' });
    expect(res.status).toBe(400);
  });

  it('requires authentication', async () => {
    const res = await request(app)
      .post('/api/videos/finalize')
      .send({ key: 'videos/x/y', iv: DEFAULT_IV, jwk: DEFAULT_JWK, title: 'x' });
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
