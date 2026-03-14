const mongoose = require('mongoose');

let isConnected = false;

async function connectDB() {
  if (isConnected && mongoose.connection.readyState === 1) return;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌  MONGODB_URI not set in .env');
    process.exit(1);
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      bufferCommands: false,
      maxPoolSize: 10,
    });
    isConnected = true;
    console.log('✅  MongoDB connected:', mongoose.connection.host);

    mongoose.connection.on('error', err => {
      console.error('MongoDB error:', err);
      isConnected = false;
    });
    mongoose.connection.on('disconnected', () => {
      isConnected = false;
    });
  } catch (err) {
    console.error('❌  MongoDB connection failed:', err.message);
    isConnected = false;
    throw err;
  }
}

module.exports = connectDB;
