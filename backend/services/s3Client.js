// Wraps S3 client construction so tests (and the e2e smoke run) can swap in
// an in-memory fake instead of talking to real AWS. Behaviour for a normal
// run (USE_FAKE_S3 unset) is unchanged: a real AWS.S3 instance.
let client;

if (process.env.USE_FAKE_S3 === 'true') {
  client = require('./fakeS3Client');
} else {
  const AWS = require('aws-sdk');
  client = new AWS.S3({
    region: process.env.AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  });
}

module.exports = client;
