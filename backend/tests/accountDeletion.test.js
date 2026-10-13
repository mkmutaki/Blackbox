// SECURITY_HARDENING_PROMPT.md §5.G (SEC-19) + §6.5: account deletion as a
// reusable, idempotent cascade-delete service, gated behind re-authentication.
const request = require('supertest');
const { app, createUserAndAgent, createAgent, uniqueEmail, VALID_PASSWORD, User } = require('./helpers');
const { deleteUserAccount } = require('../services/accountDeletion');
const s3 = require('../services/s3Client');
const Video = require('../models/Video');
const RefreshToken = require('../models/RefreshToken');
const Counter = require('../models/Counter');
const googleAuthService = require('../services/googleAuth');

const DEFAULT_IV = 'aabbccddeeff00112233445566778899';
const DEFAULT_JWK = JSON.stringify({ kty: 'oct', k: 'fake-key-material' });

const uploadVideo = async (agent, title = 'Entry') => {
  const presignRes = await agent.post('/api/videos/presign').send({});
  const uploadPath = new URL(presignRes.body.url).pathname;
  const uploadReq = request(app).post(uploadPath).set('Origin', 'http://localhost:3000');
  Object.entries(presignRes.body.fields).forEach(([field, value]) => uploadReq.field(field, value));
  await uploadReq.attach('file', Buffer.from('encrypted-bytes'), 'video.dat');

  return agent.post('/api/videos/finalize').send({
    key: presignRes.body.key, iv: DEFAULT_IV, jwk: DEFAULT_JWK, title,
  });
};

describe('deleteUserAccount (cascade-delete service)', () => {
  it('removes the user, their videos, S3 objects, refresh tokens, and the entry counter', async () => {
    const { agent, user } = await createUserAndAgent();
    await uploadVideo(agent, 'A');
    await uploadVideo(agent, 'B');

    const videosBefore = await Video.find({ ownerId: user.id });
    expect(videosBefore).toHaveLength(2);

    const result = await deleteUserAccount(user.id);

    expect(result.deletedVideoCount).toBe(2);
    expect(result.failedS3Keys).toEqual([]);
    expect(await User.findById(user.id)).toBeNull();
    expect(await Video.find({ ownerId: user.id })).toHaveLength(0);
    expect(await RefreshToken.find({ userId: user.id })).toHaveLength(0);
    expect(await Counter.findById(`video-entry:${user.id}`)).toBeNull();

    for (const v of videosBefore) {
      const head = await s3.headObject({ bucket: process.env.S3_BUCKET_NAME, key: v.s3Key });
      expect(head.exists).toBe(false);
    }
  });

  it('is idempotent — calling it again on an already-deleted account is a harmless no-op', async () => {
    const { agent, user } = await createUserAndAgent();
    await uploadVideo(agent);

    await deleteUserAccount(user.id);
    const second = await deleteUserAccount(user.id);

    expect(second.deletedVideoCount).toBe(0);
    expect(second.failedS3Keys).toEqual([]);
  });

  it('still deletes the DB records and reports the key when an S3 delete fails mid-way', async () => {
    const { agent, user } = await createUserAndAgent();
    await uploadVideo(agent, 'First');
    await uploadVideo(agent, 'Second');

    const spy = vi.spyOn(s3, 'deleteObject').mockRejectedValueOnce(new Error('S3 unavailable'));

    const result = await deleteUserAccount(user.id);

    expect(result.deletedVideoCount).toBe(2);
    expect(result.failedS3Keys).toHaveLength(1);
    // The DB side still fully cleans up even though one S3 object errored.
    expect(await User.findById(user.id)).toBeNull();
    expect(await Video.find({ ownerId: user.id })).toHaveLength(0);

    spy.mockRestore();
  });
});

describe('DELETE /api/auth/account (local accounts)', () => {
  it('requires a password', async () => {
    const { agent } = await createUserAndAgent();
    const res = await agent.delete('/api/auth/account').send({});
    expect(res.status).toBe(400);
  });

  it('rejects an incorrect password without deleting anything', async () => {
    const { agent, email } = await createUserAndAgent();
    const res = await agent.delete('/api/auth/account').send({ password: 'Wr0ng!Password' });

    expect(res.status).toBe(401);
    expect(await User.findOne({ email })).not.toBeNull();
  });

  it('deletes the account on the correct password and clears the session', async () => {
    const { agent, email, password } = await createUserAndAgent();
    await uploadVideo(agent);

    const res = await agent.delete('/api/auth/account').send({ password });
    expect(res.status).toBe(200);
    expect(await User.findOne({ email })).toBeNull();

    // The session cookies are cleared — a follow-up request is unauthenticated.
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(401);
  });

  it('requires authentication', async () => {
    const res = await request(app).delete('/api/auth/account').set('Origin', 'http://localhost:3000').send({ password: 'x' });
    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/auth/account (Google accounts)', () => {
  let verifyGoogleToken;
  beforeEach(() => {
    verifyGoogleToken = vi.spyOn(googleAuthService, 'verifyGoogleToken');
  });
  afterEach(() => {
    verifyGoogleToken.mockRestore();
  });

  const createGoogleUser = async () => {
    const email = uniqueEmail('google');
    verifyGoogleToken.mockResolvedValueOnce({ sub: 'google-sub-del', email, email_verified: true, name: 'G User' });
    const agent = createAgent();
    const res = await agent.post('/api/auth/google').send({ credential: 'fake-credential' });
    return { agent, email, user: res.body.user };
  };

  it('requires a credential', async () => {
    const { agent } = await createGoogleUser();
    const res = await agent.delete('/api/auth/account').send({});
    expect(res.status).toBe(400);
  });

  it('rejects a credential belonging to a different Google account', async () => {
    const { agent, email } = await createGoogleUser();
    verifyGoogleToken.mockResolvedValueOnce({ sub: 'someone-elses-sub', email, email_verified: true, name: 'Other' });

    const res = await agent.delete('/api/auth/account').send({ credential: 'other-credential' });
    expect(res.status).toBe(401);
    expect(await User.findOne({ email })).not.toBeNull();
  });

  it('deletes the account when the credential matches', async () => {
    const { agent, email } = await createGoogleUser();
    verifyGoogleToken.mockResolvedValueOnce({ sub: 'google-sub-del', email, email_verified: true, name: 'G User' });

    const res = await agent.delete('/api/auth/account').send({ credential: 'matching-credential' });
    expect(res.status).toBe(200);
    expect(await User.findOne({ email })).toBeNull();
  });
});
