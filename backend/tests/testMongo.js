// test-mongo.js
require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  console.log('✅ MongoDB connected');
  return mongoose.disconnect();
})
.catch(err => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});
