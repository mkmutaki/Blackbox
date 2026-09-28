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

// Test/e2e only: serves objects written to the in-memory fake S3 client so a
// real browser fetch() against a "signed" URL still resolves to bytes.
if (process.env.USE_FAKE_S3 === 'true') {
  const fakeS3 = require('./services/fakeS3Client');
  app.get('/__fake-s3__/:bucket', (req, res) => {
    const buffer = fakeS3._getObjectBuffer(req.params.bucket, req.query.key);
    if (!buffer) return res.status(404).end();
    res.set('Content-Type', 'application/octet-stream');
    res.send(buffer);
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
