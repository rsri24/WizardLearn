require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');
const rateLimit = require('express-rate-limit');
const path    = require('path');

const connectDB = require('./db');
const authRoutes          = require('./routes/auth');
const questionRoutes      = require('./routes/questions');
const progressRoutes      = require('./routes/progress');
const adminRoutes         = require('./routes/admin');
const notificationRoutes  = require('./routes/notifications');
const helpRoutes          = require('./routes/help');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── API call tracking middleware (feeds admin /api-usage endpoint) ────────────
app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) return next();
  const start = Date.now();
  res.on('finish', () => {
    try {
      const { trackApiCall } = require('./routes/admin');
      // Normalise path — replace IDs so routes group correctly
      const normPath = req.path.replace(/[a-f\d]{24}/gi, ':id').replace(/\d+/g, ':n');
      trackApiCall(req.method, normPath, res.statusCode, Date.now() - start);
    } catch(e) {}
  });
  next();
});

// ── Rate limiting ─────────────────────────────────────────────────────────────
app.use('/api/', rateLimit({ windowMs: 15*60*1000, max: 200, standardHeaders: true, message: { success:false, message:'Too many requests.' } }));
app.use('/api/auth/', rateLimit({ windowMs: 15*60*1000, max: 20, message: { success:false, message:'Too many auth attempts.' } }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',          authRoutes);
app.use('/api/questions',     questionRoutes);
app.use('/api/progress',      progressRoutes);
app.use('/api/admin',         adminRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/help',          helpRoutes);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', env: process.env.NODE_ENV, time: new Date().toISOString() });
});

// ── Serve frontend ────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: process.env.NODE_ENV === 'production' ? 'Something went wrong.' : err.message });
});

// ── Cron jobs ─────────────────────────────────────────────────────────────────
function startCronJobs() {
  try {
    const cron = require('node-cron');
    const { createStreakReminders } = require('./services/notificationService');
    const { sendWeeklyReport } = require('./services/emailService');

    // Daily at 6 PM — streak reminders for users who haven't practised today
    cron.schedule('0 18 * * *', async () => {
      console.log('⏰ Running streak reminder cron...');
      try {
        const today = new Date(new Date().setHours(0,0,0,0));
        const usersAtRisk = await require('./models/User').find({
          streak: { $gt: 0 },
          lastActiveDate: { $lt: today },
          isActive: true,
        }).select('_id displayName streak email');
        await createStreakReminders(usersAtRisk);
        console.log(`✅ Streak reminders sent to ${usersAtRisk.length} users`);
      } catch(e) { console.error('Streak cron error:', e.message); }
    });

    // Weekly Sunday 9 AM — parent reports
    cron.schedule('0 9 * * 0', async () => {
      console.log('📊 Running weekly parent report cron...');
      try {
        const parents = await require('./models/User').find({ role: 'parent', isActive: true, 'settings.weeklyReport': true });
        for (const parent of parents) {
          try {
            await sendWeeklyReport(parent.email, parent.displayName, { questions: 0, accuracy: 0, timeHours: 0, timeMins: 0, xp: 0, streak: 0 });
          } catch(e) { console.error(`Report failed for ${parent.email}:`, e.message); }
        }
        console.log(`✅ Weekly reports sent to ${parents.length} parents`);
      } catch(e) { console.error('Report cron error:', e.message); }
    });

    console.log('✅ Cron jobs registered');
  } catch(e) {
    console.warn('node-cron not installed — cron jobs skipped. Run: npm install node-cron');
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────
// Ensure DB is connected before every request (critical for Vercel serverless)
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('DB connection failed:', err.message);
    res.status(503).json({ success: false, message: 'Database unavailable. Please try again.' });
  }
});
```

Click **Commit changes**.

---

## Redeploy on Vercel

**Vercel → Deployments → three dots → Redeploy**

Wait 60 seconds then test:
```
https://wizard-learn.vercel.app/api/admin/dashboard?secret=wizardlearn_admin_2024

if (process.env.NODE_ENV !== 'production') {
  startCronJobs();
  app.listen(PORT, () => {
    console.log(`\n🧙  WizardLearn running on http://localhost:${PORT}\n`);
  });
} else {
  startCronJobs();
}

// Export for Vercel serverless
module.exports = app;
