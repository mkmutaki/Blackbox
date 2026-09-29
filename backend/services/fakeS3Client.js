// In-memory stand-in for the S3 interface this app actually uses
// (createPresignedPost, getSignedGetUrl, headObject, deleteObject). Used by
// tests and the e2e smoke run so nothing ever touches a real bucket.
//
// The presigned POST it hands back points at this same server's
// /__fake-s3__/post route (mounted in app.js only when USE_FAKE_S3=true),
// which a real browser can actually POST multipart/form-data to — so the
// frontend's upload code runs unmodified against it. Signed GET URLs
// likewise point at /__fake-s3__/:bucket, so a real fetch() for playback
// resolves to bytes too.
const store = new Map();

const storeKey = (bucket, key) => `${bucket}::${key}`;

const baseUrl = () => process.env.FAKE_S3_BASE_URL || `http://localhost:${process.env.PORT || 5100}`;

module.exports = {
  async createPresignedPost({ bucket, key }) {
    return {
      url: `${baseUrl()}/__fake-s3__/post`,
      fields: { bucket, key },
    };
  },

  async getSignedGetUrl({ bucket, key }) {
    return `${baseUrl()}/__fake-s3__/${encodeURIComponent(bucket)}?key=${encodeURIComponent(key)}`;
  },

  async headObject({ bucket, key }) {
    const buffer = store.get(storeKey(bucket, key));
    return buffer ? { exists: true, size: buffer.length } : { exists: false };
  },

  async deleteObject({ bucket, key }) {
    store.delete(storeKey(bucket, key));
  },

  // Test/e2e-only helpers, not part of the real S3 interface.
  _putObjectBuffer(bucket, key, buffer) {
    store.set(storeKey(bucket, key), buffer);
  },
  _getObjectBuffer(bucket, key) {
    return store.get(storeKey(bucket, key));
  },
  _reset() {
    store.clear();
  },
};
