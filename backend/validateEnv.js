// Startup-only env validation. Deliberately not required by app.js, so
// tests (which set their own env vars directly, never load .env) never run
// through this. Only server.js calls it, before anything else boots.
const { z } = require('zod');

// No database-name requirement on MONGO_URI on purpose — migration to a
// named database is a separate, later task. See CLAUDE.md non-negotiable #3.
const envSchema = z.object({
  MONGO_URI: z
    .string()
    .regex(/^mongodb(\+srv)?:\/\/.+/, 'must be a mongodb:// or mongodb+srv:// connection string'),
  JWT_SECRET: z.string().min(32, 'must be at least 32 characters (use random bytes, not a word)'),
  GOOGLE_CLIENT_ID: z.string().min(1),
  AWS_REGION: z.string().min(1),
  AWS_ACCESS_KEY_ID: z.string().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().min(1),
  S3_BUCKET_NAME: z.string().min(1),
  MAX_UPLOAD_BYTES: z.coerce.number().positive().optional(),
  PORT: z.coerce.number().positive().optional(),
});

// Fails fast with the list of what's wrong — field names and constraint
// descriptions only, never the offending value, so a malformed secret is
// never echoed to a terminal or a log aggregator.
const validateEnv = () => {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    console.error(`Invalid environment configuration:\n${problems}`);
    process.exit(1);
  }

  return result.data;
};

module.exports = { validateEnv };
