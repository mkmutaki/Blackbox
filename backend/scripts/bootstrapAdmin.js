// First-admin bootstrap (SECURITY_HARDENING_PROMPT.md §6.6). The only
// code path that ever sets `role: 'admin'` — there is deliberately no HTTP
// route or UI for it.
//
//   node scripts/bootstrapAdmin.js --email you@example.com           # dry run
//   node scripts/bootstrapAdmin.js --email you@example.com --write   # apply
//
// Dry-run by default: prints what it would do and changes nothing. It only
// ever creates the *first* admin — once one exists it refuses, and further
// admins are a direct database operation (or the admin panel, later). The
// target must be an existing account with a verified email, so an account
// someone pre-registered with your address can't be the one promoted.
//
// Connects to whatever MONGO_URI points at (backend/.env). Check that
// before running with --write.
const path = require('node:path');
const mongoose = require('mongoose');
const User = require('../models/User');
const { logSecurityEvent } = require('../services/securityLog');

const USAGE = 'Usage: node scripts/bootstrapAdmin.js --email <address> [--write]';

const parseArgs = (argv) => {
  const emailIndex = argv.indexOf('--email');
  const email = emailIndex === -1 ? undefined : argv[emailIndex + 1];

  return {
    email: typeof email === 'string' && !email.startsWith('--') ? email.trim().toLowerCase() : undefined,
    write: argv.includes('--write'),
  };
};

// Returns { ok, message } rather than throwing, so the CLI wrapper and the
// tests read the same outcome.
const bootstrapAdmin = async ({ email, write = false }) => {
  if (!email) {
    return { ok: false, message: USAGE };
  }

  const existingAdmin = await User.exists({ role: 'admin' });
  if (existingAdmin) {
    return { ok: false, message: 'An admin already exists. This script only creates the first one.' };
  }

  const user = await User.findOne({ email }).select('email role emailVerified');
  if (!user) {
    return { ok: false, message: `No account found for ${email}.` };
  }

  if (!user.emailVerified) {
    return { ok: false, message: `${email} has not verified its email address. Verify it first, then re-run.` };
  }

  if (!write) {
    return { ok: true, message: `[dry run] Would promote ${email} (${user._id}) to admin. Re-run with --write to apply.` };
  }

  // Conditional on role still being 'user' so two concurrent runs can't
  // both report success.
  const result = await User.updateOne({ _id: user._id, role: 'user' }, { $set: { role: 'admin' } });
  if (result.modifiedCount !== 1) {
    return { ok: false, message: `${email} was not promoted — its role changed while this script was running.` };
  }

  await logSecurityEvent('admin_bootstrap', {
    targetType: 'user',
    targetId: user._id,
    meta: { email, via: 'bootstrap_script' },
  });

  return { ok: true, message: `Promoted ${email} (${user._id}) to admin.` };
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  // Checked before connecting, so a malformed invocation never touches a
  // database at all.
  if (!args.email) {
    console.error(USAGE);
    process.exit(1);
  }

  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set.');
    process.exit(1);
  }

  // Same connection call as server.js — no dbName override (database
  // naming is deliberately untouched until the planned migration).
  await mongoose.connect(process.env.MONGO_URI);
  // Host only: the URI itself carries credentials.
  console.log(`Connected to ${mongoose.connection.host}${args.write ? '' : ' (dry run — nothing will be written)'}`);

  try {
    const { ok, message } = await bootstrapAdmin(args);
    (ok ? console.log : console.error)(message);
    process.exitCode = ok ? 0 : 1;
  } finally {
    await mongoose.disconnect();
  }
};

if (require.main === module) {
  main().catch((err) => {
    console.error(`Bootstrap failed: ${err.name}: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { bootstrapAdmin, parseArgs };
