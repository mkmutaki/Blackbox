const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const videoRoutes = require('./routes/videoRoutes');
const authRoutes = require('./routes/authRoutes');
const profileRoutes = require('./routes/profileRoutes');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: [
    'https://mkmutaki.github.io',
    'http://localhost:8080',
    'http://localhost:3000'
  ],
  credentials: true
}));
app.use(express.json());

// Simple health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Test/e2e only: stands in for S3 so uploads and "signed" fetches resolve to
// real bytes without touching a real bucket. Also gated on NODE_ENV as
// defence in depth — this must never be reachable in production even if
// USE_FAKE_S3 were set there by mistake (see SECURITY_AUDIT.md SEC-29).
if (process.env.USE_FAKE_S3 === 'true' && process.env.NODE_ENV !== 'production') {
  const fakeS3 = require('./services/fakeS3Client');
  const multer = require('multer');
  const fakeUpload = multer({ storage: multer.memoryStorage() });

  app.get('/__fake-s3__/:bucket', (req, res) => {
    const buffer = fakeS3._getObjectBuffer(req.params.bucket, req.query.key);
    if (!buffer) return res.status(404).end();
    res.set('Content-Type', 'application/octet-stream');
    res.send(buffer);
  });

  // Stands in for a real presigned POST target: the frontend sends the same
  // multipart/form-data request it would send to S3, we just store it.
  app.post('/__fake-s3__/post', fakeUpload.single('file'), (req, res) => {
    const { bucket, key } = req.body;
    if (!req.file || !bucket || !key) return res.status(400).end();
    fakeS3._putObjectBuffer(bucket, key, req.file.buffer);
    res.status(204).end();
  });
}

// Routes
app.use('/api/videos', videoRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Server error',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

module.exports = app;
