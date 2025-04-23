// test-s3.js
require('dotenv').config();
const AWS = require('aws-sdk');
const fs = require('fs');

const s3 = new AWS.S3({
  region: process.env.AWS_REGION,
});

// Option A: Upload a local file
const fileStream = fs.createReadStream('./what.txt');

s3.upload({
  Bucket: process.env.S3_BUCKET_NAME,
  Key: 'test/what.txt',
  Body: fileStream,
})
.promise()
.then(res => console.log('✅ S3 upload succeeded:', res.Location))
.catch(err => {
  console.error('❌ S3 upload failed:', err);
  process.exit(1);
});
