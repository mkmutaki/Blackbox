const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const videoRoutes = require('./routes/videoRoutes');
const authRoutes = require('./routes/authRoutes');
const profileRoutes = require('./routes/profileRoutes');
const { csrfOriginCheck, getAllowedOrigins } = require('./middleware/csrf');

// Defence in depth under SEC-06/SEC-26: every string field that reaches a
// query filter is already pinned to z.string() by middleware/validate.js,
// but sanitizeFilter strips Mongo operators from any filter object as a
// second layer. strictQuery rejects filter paths that aren't in the
// schema instead of silently casting them.
mongoose.set('sanitizeFilter', true);
mongoose.set('strictQuery', true);

const app = express();

// Render sits in front of this app behind exactly one reverse-proxy hop —
// trusting that (and only that) hop means req.ip reflects the real client,
// which both rate limiting and the CSRF check below rely on.
app.set('trust proxy', 1);

// Security middleware. This is a pure JSON API with no HTML/static assets
// of its own, so a locked-down CSP (default-src 'none') is safe — it only
// ever matters if a browser ever tried to render one of these responses
// as a document, which never happens in normal use.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginResourcePolicy: { policy: 'same-origin' },
  hsts: {
    maxAge: 63072000, // 2 years
    includeSubDomains: true,
  },
}));
app.use(cors({
  origin: (origin, callback) => callback(null, !origin || getAllowedOrigins().includes(origin)),
  credentials: true
}));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(csrfOriginCheck);

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

// Fixed wording for client errors raised by middleware (express.json's
// malformed-body/too-large errors). The parser's own message isn't used:
// it quotes the request body back.
const CLIENT_ERROR_MESSAGES = {
  400: 'Invalid request',
  413: 'Request body too large',
  415: 'Unsupported request encoding',
};

// Error handling middleware
app.use((err, req, res, next) => {
  // A 4xx raised by middleware is the client's mistake, not a server fault:
  // answer with its real status instead of a 500 (SEC-37), and don't dump
  // a stack trace for it.
  const status = err.status || err.statusCode;
  if (Number.isInteger(status) && status >= 400 && status < 500) {
    console.error(`Client error ${status}: ${err.type || err.name}`);
    return res.status(status).json({ error: CLIENT_ERROR_MESSAGES[status] || 'Invalid request' });
  }

  console.error(err.stack);
  res.status(500).json({
    error: 'Server error',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

module.exports = app;
