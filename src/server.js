require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

const connectDB = require('./db');
const authRoutes = require('./routes/auth');
const questionRoutes = require('./routes/questions');
const progressRoutes = require('./routes/progress');
const adminRoutes = require('./routes/admin');

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  message: { success: false, message: 'Too many requests. Please slow down.' },
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many auth attempts. Wait 15 minutes.' },
});

app.use('/api/', apiLimiter);
app.use('/api/auth/', authLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', env: process.env.NODE_ENV, time: new Date().toISOString() });
});

app.use(express.static(path.join(__dirname, '../public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong.' : err.message,
  });
});

// Connect to MongoDB
connectDB().catch(err => console.error('MongoDB connection error:', err));

// THIS LINE IS CRITICAL — exports the app for Vercel serverless
module.exports = app;

// Only listen locally in development
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`🧙 Running on http://localhost:${PORT}`));
}
