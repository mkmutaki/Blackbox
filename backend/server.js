require('dotenv').config();
const { validateEnv } = require('./validateEnv');

validateEnv();

const mongoose = require('mongoose');
const app = require('./app');
const { startEmailWorker } = require('./services/emailQueue');
const emailProvider = require('./services/emailProvider');

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => {
    console.log('MongoDB connected');
    console.log(emailProvider.isConfigured()
      ? 'Email: sending through Resend'
      : 'Email: RESEND_API_KEY not set, emails are stubbed (logged, not sent)');
    startEmailWorker();
  })
  .catch(err => {
    // Serving requests against a database that never connected means every
    // route silently 500s instead of the failure being visible at deploy
    // time (SEC-14). Fail fast instead.
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

const PORT = process.env.PORT || 5100;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
