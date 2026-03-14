require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const morgan    = require('morgan');
const rateLimit = require('express-rate-limit');
const path      = require('path');
const mongoose  = require('mongoose');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── DB connection (cached for serverless) ─────────────────────────────────────
let dbConnected = false;
async function ensureDB() {
  if (dbConnected && mongoose.connection.readyState === 1) return;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set in environment variables');
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 15000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10,
    bufferCommands: true,
  });
  dbConnected = true;
  console.log('✅ MongoDB connected');
}

// ── Security & middleware ──────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── Connect DB before every API request ───────────────────────────────────────
app.use('/api', async (req, res, next) => {
  try {
    await ensureDB();
    next();
  } catch (err) {
    console.error('DB connection error:', err.message);
    return res.status(503).json({ success: false, message: 'Database unavailable. Please try again in a moment.' });
  }
});

// ── API call tracking ──────────────────────────────────────────────────────────
app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) return next();
  const start = Date.now();
  res.on('finish', () => {
    try {
      const { trackApiCall } = require('./routes/admin');
      const normPath = req.path.replace(/[a-f\d]{24}/gi, ':id').replace(/\d+/g, ':n');
      trackApiCall(req.method, normPath, res.statusCode, Date.now() - start);
    } catch(e) {}
  });
  next();
});

// ── Rate limiting ──────────────────────────────────────────────────────────────
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true,
  message: { success: false, message: 'Too many requests.' }
}));
app.use('/api/auth/', rateLimit({
  windowMs: 15 * 60 * 1000, max: 20,
  message: { success: false, message: 'Too many auth attempts.' }
}));

// ── Routes ─────────────────────────────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/questions',     require('./routes/questions'));
app.use('/api/progress',      require('./routes/progress'));
app.use('/api/admin',         require('./routes/admin'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/help',          require('./routes/help'));

// ── Health check ───────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    env: process.env.NODE_ENV,
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    time: new Date().toISOString()
  });
});

// ── Serve frontend ─────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

// ── Global error handler ───────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong.' : err.message
  });
});

// ── Cron jobs (dev only — Vercel serverless doesn't support persistent crons) ──
if (process.env.NODE_ENV !== 'production') {
  ensureDB().then(() => {
    try {
      const cron = require('node-cron');
      const { createStreakReminders } = require('./services/notificationService');
      const { sendWeeklyReport } = require('./services/emailService');
      const User = require('./models/User');

      cron.schedule('0 18 * * *', async () => {
        const today = new Date(new Date().setHours(0,0,0,0));
        const usersAtRisk = await User.find({ streak:{ $gt:0 }, lastActiveDate:{ $lt:today }, isActive:true }).select('_id displayName streak email');
        await createStreakReminders(usersAtRisk);
        console.log(`✅ Streak reminders sent to ${usersAtRisk.length} users`);
      });

      cron.schedule('0 9 * * 0', async () => {
        const parents = await User.find({ role:'parent', isActive:true, 'settings.weeklyReport':true });
        for (const p of parents) {
          await sendWeeklyReport(p.email, p.displayName, { questions:0, accuracy:0, timeHours:0, timeMins:0, xp:0, streak:0 }).catch(console.error);
        }
        console.log(`✅ Weekly reports sent to ${parents.length} parents`);
      });

      console.log('✅ Cron jobs registered');
    } catch(e) {
      console.warn('node-cron not available:', e.message);
    }
  }).catch(console.error);

  app.listen(PORT, () => {
    console.log(`\n🧙  WizardLearn running on http://localhost:${PORT}\n`);
  });
}

// ── Export for Vercel ──────────────────────────────────────────────────────────
module.exports = app;
```

Commit → **Vercel → Redeploy** → wait 60 seconds → test:
```
https://wizard-learn.vercel.app/api/health
```

Should show `"db":"connected"`. Then test:
```
https://wizard-learn.vercel.app/api/admin/dashboard?secret=wizardlearn_admin_2024
