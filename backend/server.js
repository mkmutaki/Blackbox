
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const videoRoutes = require('./routes/videoRoutes');

// Create Express app
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());

// Static files
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// API routes
app.use('/api/videos', videoRoutes);

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// Serve frontend in production
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
