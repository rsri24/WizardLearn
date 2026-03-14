const mongoose = require('mongoose');

let isConnected = false;

async function connectDB() {
  if (isConnected) return;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌  MONGODB_URI not set in .env');
    process.exit(1);
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    isConnected = true;
    console.log('✅  MongoDB connected:', mongoose.connection.host);

    mongoose.connection.on('error', err => {
      console.error('MongoDB error:', err);
      isConnected = false;
    });
    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB disconnected — will retry');
      isConnected = false;
    });
  } catch (err) {
    console.error('❌  MongoDB connection failed:', err.message);
    // In production keep retrying; in dev exit so you notice immediately
    if (process.env.NODE_ENV === 'production') {
      setTimeout(connectDB, 5000);
    } else {
      process.exit(1);
    }
  }
}

module.exports = connectDB;
