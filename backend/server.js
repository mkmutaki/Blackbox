require('dotenv').config();
const { validateEnv } = require('./validateEnv');

validateEnv();

const mongoose = require('mongoose');
const app = require('./app');

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

const PORT = process.env.PORT || 5100;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
