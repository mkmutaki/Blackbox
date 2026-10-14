// SECURITY_HARDENING_PROMPT.md §6.6: the first-admin bootstrap script is
// dry-run by default and only writes with an explicit flag. Exercised
// against the in-memory database only — the CLI wrapper (which would load
// backend/.env and connect to MONGO_URI) is never invoked here.
const AuditLog = require('../models/AuditLog');
const { bootstrapAdmin, parseArgs } = require('../scripts/bootstrapAdmin');
const { createUserAndAgent, User } = require('./helpers');

const verifiedUser = async () => {
  const { email, user } = await createUserAndAgent();
  await User.updateOne({ email }, { emailVerified: true });
  return { email, user };
};

const roleOf = async (email) => (await User.findOne({ email }).select('role')).role;

describe('parseArgs', () => {
  it('defaults to a dry run', () => {
    expect(parseArgs(['--email', 'A@Example.com '])).toEqual({ email: 'a@example.com', write: false });
  });

  it('only writes with an explicit --write flag', () => {
    expect(parseArgs(['--email', 'a@example.com', '--write']).write).toBe(true);
  });

  it('treats a missing or flag-shaped email value as absent', () => {
    expect(parseArgs([]).email).toBeUndefined();
    expect(parseArgs(['--email']).email).toBeUndefined();
    expect(parseArgs(['--email', '--write']).email).toBeUndefined();
  });
});

describe('bootstrapAdmin', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('changes nothing on a dry run', async () => {
    const { email } = await verifiedUser();

    const result = await bootstrapAdmin({ email });

    expect(result.ok).toBe(true);
    expect(result.message).toContain('[dry run]');
    expect(await roleOf(email)).toBe('user');
    expect(await AuditLog.countDocuments({ action: 'admin_bootstrap' })).toBe(0);
  });

  it('promotes the user and writes an audit entry with --write', async () => {
    const { email, user } = await verifiedUser();

    const result = await bootstrapAdmin({ email, write: true });

    expect(result.ok).toBe(true);
    expect(await roleOf(email)).toBe('admin');

    const entry = await AuditLog.findOne({ action: 'admin_bootstrap' }).lean();
    expect(entry.actor).toBeNull();
    expect(entry.targetId).toBe(user.id);
    expect(entry.meta.email).toBe(`${email[0]}***@example.com`);
  });

  it('refuses once any admin already exists', async () => {
    const first = await verifiedUser();
    const second = await verifiedUser();
    await bootstrapAdmin({ email: first.email, write: true });

    const result = await bootstrapAdmin({ email: second.email, write: true });

    expect(result.ok).toBe(false);
    expect(await roleOf(second.email)).toBe('user');
  });

  it('refuses an account whose email is not verified', async () => {
    const { email } = await createUserAndAgent();

    const result = await bootstrapAdmin({ email, write: true });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('not verified');
    expect(await roleOf(email)).toBe('user');
  });

  it('refuses an unknown email and a missing email', async () => {
    expect((await bootstrapAdmin({ email: 'nobody@example.com', write: true })).ok).toBe(false);
    expect((await bootstrapAdmin({ write: true })).ok).toBe(false);
  });
});
