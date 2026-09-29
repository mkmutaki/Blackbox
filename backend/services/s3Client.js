// Wraps S3 access behind one small interface — createPresignedPost,
// getSignedGetUrl, headObject, deleteObject — so tests and the e2e run can
// swap in an in-memory fake (backend/services/fakeS3Client.js) instead of
// talking to real AWS. Behaviour for a normal run (USE_FAKE_S3 unset) is a
// real AWS SDK v3 S3 client.
let client;

if (process.env.USE_FAKE_S3 === 'true') {
  client = require('./fakeS3Client');
} else {
  const { S3Client, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
  const { createPresignedPost: createPresignedPostForm } = require('@aws-sdk/s3-presigned-post');

  const s3 = new S3Client({ region: process.env.AWS_REGION });

  client = {
    async createPresignedPost({ bucket, key, contentType, maxBytes, expiresSeconds }) {
      return createPresignedPostForm(s3, {
        Bucket: bucket,
        Key: key,
        Conditions: [
          ['content-length-range', 0, maxBytes],
          ['eq', '$Content-Type', contentType],
        ],
        Fields: {
          'Content-Type': contentType,
        },
        Expires: expiresSeconds,
      });
    },

    async getSignedGetUrl({ bucket, key, expiresSeconds }) {
      const command = new GetObjectCommand({ Bucket: bucket, Key: key });
      return getSignedUrl(s3, command, { expiresIn: expiresSeconds });
    },

    async headObject({ bucket, key }) {
      try {
        const result = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return { exists: true, size: result.ContentLength };
      } catch (err) {
        if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
          return { exists: false };
        }
        throw err;
      }
    },

    async deleteObject({ bucket, key }) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}

module.exports = client;
