// In-memory stand-in for the AWS.S3 surface this app actually uses
// (putObject, getSignedUrl, deleteObject). Used by tests and the e2e smoke
// run so nothing ever touches a real bucket. Signed URLs point back at this
// same server's /__fake-s3__ route (mounted in app.js only when
// USE_FAKE_S3=true), so a real browser fetch() in the e2e test still works.
const store = new Map();

const storeKey = (bucket, key) => `${bucket}::${key}`;

module.exports = {
  putObject({ Bucket, Key, Body }) {
    const buffer = Buffer.isBuffer(Body) ? Body : Buffer.from(Body);
    store.set(storeKey(Bucket, Key), buffer);
    return { promise: () => Promise.resolve({}) };
  },

  getSignedUrl(_operation, { Bucket, Key }) {
    const base = process.env.FAKE_S3_BASE_URL || `http://localhost:${process.env.PORT || 5100}`;
    return `${base}/__fake-s3__/${encodeURIComponent(Bucket)}?key=${encodeURIComponent(Key)}`;
  },

  deleteObject({ Bucket, Key }) {
    store.delete(storeKey(Bucket, Key));
    return { promise: () => Promise.resolve({}) };
  },

  // Test/e2e-only helpers, not part of the real AWS.S3 surface.
  _getObjectBuffer(Bucket, Key) {
    return store.get(storeKey(Bucket, Key));
  },
  _has(Bucket, Key) {
    return store.has(storeKey(Bucket, Key));
  },
  _reset() {
    store.clear();
  },
};
