// Boots the real Express app for the Playwright smoke test: an in-memory
// Mongo instance and the fake S3 client, no real AWS/Atlas involved, and no
// dotenv (so it can never pick up real secrets from backend/.env).
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.USE_FAKE_S3 = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'e2e-test-secret-not-for-prod-0123456789abcdef';
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'e2e-test-google-client-id';
process.env.S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || 'e2e-test-bucket';
process.env.AWS_REGION = process.env.AWS_REGION || 'us-east-1';

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../app');

(async () => {
  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  const PORT = process.env.PORT || 5100;
  const server = app.listen(PORT, () => {
    console.log(`[e2e] backend listening on ${PORT}`);
  });

  const shutdown = async () => {
    server.close();
    await mongoose.disconnect();
    await mongod.stop();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
})();
