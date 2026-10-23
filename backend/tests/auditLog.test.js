// SECURITY_HARDENING_PROMPT.md §6.2: AuditLog is append-only, and the §5.G
// security events are persisted through it — proven in use before any
// admin panel reads it.
const fs = require('node:fs');
const path = require('node:path');
const AuditLog = require('../models/AuditLog');
const { logSecurityEvent } = require('../services/securityLog');
const { createAgent, createUserAndAgent, User } = require('./helpers');

const seedEntry = () => AuditLog.create({ action: 'seed_event', meta: { n: 1 } });

describe('AuditLog is append-only', () => {
  it('allows creating an entry', async () => {
    const entry = await seedEntry();
    expect(entry.createdAt).toBeInstanceOf(Date);
    expect(await AuditLog.countDocuments()).toBe(1);
  });

  it('rejects re-saving an existing entry', async () => {
    const entry = await seedEntry();
    entry.action = 'tampered';
    await expect(entry.save()).rejects.toThrow('append-only');
  });

  it('rejects document.deleteOne() and document.updateOne()', async () => {
    const entry = await seedEntry();
    await expect(entry.deleteOne()).rejects.toThrow('append-only');
    await expect(entry.updateOne({ action: 'tampered' })).rejects.toThrow('append-only');
  });

  it.each([
    ['updateOne', (M) => M.updateOne({}, { action: 'tampered' })],
    ['updateMany', (M) => M.updateMany({}, { action: 'tampered' })],
    ['findOneAndUpdate', (M) => M.findOneAndUpdate({}, { action: 'tampered' })],
    ['findByIdAndUpdate', (M, e) => M.findByIdAndUpdate(e._id, { action: 'tampered' })],
    ['replaceOne', (M) => M.replaceOne({}, { action: 'tampered' })],
    ['findOneAndReplace', (M) => M.findOneAndReplace({}, { action: 'tampered' })],
    ['deleteOne', (M) => M.deleteOne({})],
    ['deleteMany', (M) => M.deleteMany({})],
    ['findOneAndDelete', (M) => M.findOneAndDelete({})],
    ['findByIdAndDelete', (M, e) => M.findByIdAndDelete(e._id)],
    ['bulkWrite', (M) => M.bulkWrite([{ deleteMany: { filter: {} } }])],
  ])('rejects Model.%s', async (_name, op) => {
    const entry = await seedEntry();
    await expect(op(AuditLog, entry)).rejects.toThrow('append-only');

    const after = await AuditLog.findById(entry._id);
    expect(after.action).toBe('seed_event');
  });

  it('expires entries after 12 months, the period the Privacy Policy states', async () => {
    expect(AuditLog.RETENTION_SECONDS).toBe(365 * 24 * 60 * 60);

    await AuditLog.syncIndexes();
    const ttl = (await AuditLog.collection.indexes()).find((index) => index.expireAfterSeconds !== undefined);
    expect(ttl.key).toEqual({ createdAt: 1 });
    expect(ttl.expireAfterSeconds).toBe(AuditLog.RETENTION_SECONDS);
  });

  it('is only ever referenced by services/securityLog.js in application code', () => {
    // Funnelling every write through one function is what keeps redaction
    // and append-only from being bypassed by a future caller. Reading the
    // log (the admin panel) will add a second legitimate reference here.
    const root = path.join(__dirname, '..');
    const offenders = [];

    const walk = (dir) => {
      for (const name of fs.readdirSync(dir)) {
        if (['node_modules', 'tests'].includes(name)) continue;
        const full = path.join(dir, name);
        if (fs.statSync(full).isDirectory()) walk(full);
        else if (name.endsWith('.js') && /models\/AuditLog|['"]\.\/AuditLog['"]/.test(fs.readFileSync(full, 'utf8'))) {
          offenders.push(path.relative(root, full));
        }
      }
    };
    walk(root);

    expect(offenders).toEqual(['services/securityLog.js']);
  });
});

describe('logSecurityEvent persists to AuditLog', () => {
  let logSpy;
  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    logSpy.mockRestore();
  });

  it('stores actor, target, ip and redacted meta — including nested keys', async () => {
    const { user } = await createUserAndAgent();

    await logSecurityEvent('test_event', {
      actor: user.id,
      targetType: 'user',
      targetId: user.id,
      ip: '203.0.113.7',
      meta: { email: 'victim@example.com', password: 'hunter2', nested: { jwk: '{"k":"x"}', kept: 1 } },
    });

    const entry = await AuditLog.findOne({ action: 'test_event' }).lean();
    expect(String(entry.actor)).toBe(user.id);
    expect(entry.targetType).toBe('user');
    expect(entry.targetId).toBe(user.id);
    expect(entry.ip).toBe('203.0.113.7');
    expect(entry.meta).toEqual({
      email: 'v***@example.com',
      password: '[redacted]',
      nested: { jwk: '[redacted]', kept: 1 },
    });
  });

  it('never throws when the audit write fails — the triggering request still succeeds', async () => {
    const createSpy = vi.spyOn(AuditLog, 'create').mockRejectedValue(new Error('db down'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { email, password } = await createUserAndAgent();
    const res = await createAgent().post('/api/auth/login').send({ email, password });

    expect(res.status).toBe(200);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Audit log write failed for "login_success"'));

    createSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('records a real login_success and an anonymous login_failure', async () => {
    const { email, password, user } = await createUserAndAgent();

    await createAgent().post('/api/auth/login').send({ email, password });
    await createAgent().post('/api/auth/login').send({ email, password: 'Wr0ng!Password' });

    const success = await AuditLog.findOne({ action: 'login_success' }).lean();
    expect(String(success.actor)).toBe(user.id);
    expect(success.targetId).toBe(user.id);

    // Nobody authenticated performed a failed login — actor is null, the
    // account being guessed at is the target.
    const failure = await AuditLog.findOne({ action: 'login_failure' }).lean();
    expect(failure.actor).toBeNull();
    expect(failure.targetId).toBe(user.id);
    expect(JSON.stringify(failure)).not.toContain(email);
  });

  it('keeps the account_deleted entry after the account itself is gone', async () => {
    const { agent, password, user } = await createUserAndAgent();

    const res = await agent.delete('/api/auth/account').send({ password });
    expect(res.status).toBe(200);
    expect(await User.findById(user.id)).toBeNull();

    const entry = await AuditLog.findOne({ action: 'account_deleted' }).lean();
    expect(entry.targetId).toBe(user.id);
    expect(entry.meta.failedS3Keys).toEqual([]);
  });
});
