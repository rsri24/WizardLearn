require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const morgan   = require('morgan');
const rateLimit = require('express-rate-limit');
const path     = require('path');
const mongoose = require('mongoose');

const app  = express();
const PORT = process.env.PORT || 3000;

// DB connection
let dbConnected = false;
async function ensureDB() {
  if (dbConnected && mongoose.connection.readyState === 1) return;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set');
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 15000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10,
  });
  dbConnected = true;
  console.log('MongoDB connected');
}

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Ensure DB before every API call
app.use('/api', async (req, res, next) => {
  try {
    await ensureDB();
    next();
  } catch (err) {
    console.error('DB error:', err.message);
    res.status(503).json({ success: false, message: 'Database unavailable. Try again.' });
  }
});

// Rate limiting
app.use('/api/', rateLimit({ windowMs: 15*60*1000, max: 200, standardHeaders: true, message: { success: false, message: 'Too many requests.' } }));
app.use('/api/auth/', rateLimit({ windowMs: 15*60*1000, max: 20, message: { success: false, message: 'Too many auth attempts.' } }));

// Routes
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/questions',     require('./routes/questions'));
app.use('/api/progress',      require('./routes/progress'));
app.use('/api/admin',         require('./routes/admin'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/help',          require('./routes/help'));

// Health
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', env: process.env.NODE_ENV, db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected', time: new Date().toISOString() });
});

// Frontend
app.use(express.static(path.join(__dirname, '../public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({ success: false, message: process.env.NODE_ENV === 'production' ? 'Something went wrong.' : err.message });
});

// Export for Vercel
module.exports = app;

// Local dev only
if (process.env.NODE_ENV !== 'production') {
  ensureDB().then(() => {
    app.listen(PORT, () => console.log('Running on http://localhost:' + PORT));
  }).catch(console.error);
}
