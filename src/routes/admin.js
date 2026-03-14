const express    = require('express');
const router     = express.Router();
const mongoose   = require('mongoose');
const Question   = require('../models/Question');
const User       = require('../models/User');
const Attempt    = require('../models/Attempt');
const LoginEvent = require('../models/LoginEvent');
const Notification = require('../models/Notification');
const HelpRequest  = require('../models/HelpRequest');
const { generateQuestion } = require('../services/questionService');

// ── In-memory API call tracker ────────────────────────────────────────────────
const apiCallLog = { counts:{}, latencies:{}, errors:{}, lastReset: Date.now() };
function trackApiCall(method, path, statusCode, ms) {
  const key = `${method} ${path}`;
  if (!apiCallLog.counts[key]) { apiCallLog.counts[key]=0; apiCallLog.latencies[key]=[]; apiCallLog.errors[key]=0; }
  apiCallLog.counts[key]++;
  apiCallLog.latencies[key].push(ms);
  if (apiCallLog.latencies[key].length > 100) apiCallLog.latencies[key].shift();
  if (statusCode >= 400) apiCallLog.errors[key]++;
}

// ── Admin auth ────────────────────────────────────────────────────────────────
function adminOnly(req, res, next) {
  const secret = req.headers['x-admin-secret'] || req.query.secret;
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ success: false, message: 'Admin access denied.' });
  }
  next();
}
router.use(adminOnly);

// ── GET /api/admin/dashboard ──────────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  try {
    const now   = new Date();
    const day7  = new Date(now - 7  * 86400000);
    const day30 = new Date(now - 30 * 86400000);
    const today = new Date(new Date().setHours(0,0,0,0));

    const [
      totalUsers, activeToday, activeWeek, activeMonth,
      totalQuestions, totalAttempts,
      newUsersToday, newUsersWeek,
      loginToday, loginWeek,
      accuracyAgg, topSubjects, helpRequests,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ lastActiveDate: { $gte: today } }),
      User.countDocuments({ lastActiveDate: { $gte: day7 } }),
      User.countDocuments({ lastActiveDate: { $gte: day30 } }),
      Question.countDocuments({ isActive: true }),
      Attempt.countDocuments(),
      User.countDocuments({ createdAt: { $gte: today } }),
      User.countDocuments({ createdAt: { $gte: day7 } }),
      LoginEvent.countDocuments({ createdAt: { $gte: today } }),
      LoginEvent.countDocuments({ createdAt: { $gte: day7 } }),
      Attempt.aggregate([{ $group: { _id: null, correct: { $sum: { $cond: ['$isCorrect',1,0] } }, total: { $sum: 1 } } }]),
      Attempt.aggregate([{ $group: { _id: '$subject', count: { $sum: 1 }, correct: { $sum: { $cond: ['$isCorrect',1,0] } } } }, { $sort: { count: -1 } }]),
      HelpRequest.countDocuments(),
    ]);

    const overallAccuracy = accuracyAgg[0] ? Math.round((accuracyAgg[0].correct / accuracyAgg[0].total) * 100) : 0;

    const dauTrend = await User.aggregate([
      { $match: { lastActiveDate: { $gte: new Date(Date.now() - 14 * 86400000) } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$lastActiveDate' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      success: true,
      overview: { totalUsers, activeToday, activeWeek, activeMonth, newUsersToday, newUsersWeek, loginToday, loginWeek, totalQuestions, totalAttempts, overallAccuracy, helpRequests },
      topSubjects, dauTrend,
      server: { uptime: Math.floor(process.uptime()), uptimeHuman: formatUptime(process.uptime()), memoryMB: Math.round(process.memoryUsage().rss/1024/1024), nodeVersion: process.version, env: process.env.NODE_ENV },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/admin/users ──────────────────────────────────────────────────────
router.get('/users', async (req, res) => {
  const { page=1, limit=50, search, role, targetExam, sort='-createdAt' } = req.query;
  const filter = {};
  if (search)     filter.$or = [{ email:{$regex:search,$options:'i'} }, { displayName:{$regex:search,$options:'i'} }];
  if (role)       filter.role = role;
  if (targetExam) filter.targetExam = targetExam;
  try {
    const [users, total] = await Promise.all([
      User.find(filter).select('-otp -__v').sort(sort).skip((page-1)*limit).limit(parseInt(limit)),
      User.countDocuments(filter),
    ]);
    const userIds = users.map(u => u._id);
    const lastLogins = await LoginEvent.aggregate([
      { $match: { userId: { $in: userIds } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$userId', lastLogin: { $first: '$createdAt' }, lastCity: { $first: '$city' }, lastCountry: { $first: '$country' }, loginCount: { $sum: 1 } } }
    ]);
    const loginMap = Object.fromEntries(lastLogins.map(l => [String(l._id), l]));
    const enriched = users.map(u => ({ ...u.toObject(), lastLogin: loginMap[String(u._id)]?.lastLogin, lastCity: loginMap[String(u._id)]?.lastCity, lastCountry: loginMap[String(u._id)]?.lastCountry, loginCount: loginMap[String(u._id)]?.loginCount || 0 }));
    res.json({ success: true, users: enriched, total, page: parseInt(page), pages: Math.ceil(total/limit) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/admin/users/:id ──────────────────────────────────────────────────
router.get('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-otp');
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    const [logins, attempts, help, weeklyLogins] = await Promise.all([
      LoginEvent.find({ userId: user._id }).sort({ createdAt: -1 }).limit(20),
      Attempt.aggregate([{ $match: { userId: user._id } }, { $group: { _id: '$subject', total: { $sum: 1 }, correct: { $sum: { $cond: ['$isCorrect',1,0] } }, xp: { $sum: '$xpEarned' } } }]),
      HelpRequest.find({ userId: user._id }).sort({ createdAt: -1 }).limit(10),
      LoginEvent.aggregate([
        { $match: { userId: user._id, createdAt: { $gte: new Date(Date.now() - 90*86400000) } } },
        { $group: { _id: { $dateToString: { format: '%Y-%U', date: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
    ]);
    res.json({ success: true, user: user.toObject(), logins, subjectStats: attempts, helpHistory: help, weeklyLogins });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/admin/logins ─────────────────────────────────────────────────────
router.get('/logins', async (req, res) => {
  const { page=1, limit=100, days=30 } = req.query;
  const since = new Date(Date.now() - days * 86400000);
  try {
    const [events, total] = await Promise.all([
      LoginEvent.find({ createdAt: { $gte: since } }).populate('userId','displayName email role').sort({ createdAt: -1 }).skip((page-1)*limit).limit(parseInt(limit)),
      LoginEvent.countDocuments({ createdAt: { $gte: since } }),
    ]);
    res.json({ success: true, events, total });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/admin/location-map ───────────────────────────────────────────────
router.get('/location-map', async (req, res) => {
  try {
    const [byCountry, byCity] = await Promise.all([
      LoginEvent.aggregate([
        { $group: { _id: '$country', code: { $first: '$countryCode' }, count: { $sum: 1 }, users: { $addToSet: '$userId' } } },
        { $project: { country: '$_id', code: 1, loginCount: '$count', uniqueUsers: { $size: '$users' } } },
        { $sort: { loginCount: -1 } }
      ]),
      LoginEvent.aggregate([
        { $match: { city: { $exists: true, $ne: '' } } },
        { $group: { _id: { city: '$city', country: '$country' }, count: { $sum: 1 }, lat: { $first: '$lat' }, lon: { $first: '$lon' } } },
        { $sort: { count: -1 } }, { $limit: 50 }
      ]),
    ]);
    res.json({ success: true, byCountry, byCity });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/admin/login-frequency ───────────────────────────────────────────
router.get('/login-frequency', async (req, res) => {
  try {
    const day30 = new Date(Date.now() - 30 * 86400000);
    const day7  = new Date(Date.now() - 7  * 86400000);
    const [daily, hourly] = await Promise.all([
      LoginEvent.aggregate([
        { $match: { createdAt: { $gte: day30 } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, logins: { $sum: 1 }, uniqueUsers: { $addToSet: '$userId' } } },
        { $project: { date: '$_id', logins: 1, uniqueUsers: { $size: '$uniqueUsers' } } },
        { $sort: { date: 1 } }
      ]),
      LoginEvent.aggregate([
        { $match: { createdAt: { $gte: day7 } } },
        { $group: { _id: { $hour: '$createdAt' }, count: { $sum: 1 } } },
        { $sort: { '_id': 1 } }
      ]),
    ]);
    res.json({ success: true, daily, peakHours: hourly });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/admin/api-usage ──────────────────────────────────────────────────
router.get('/api-usage', async (req, res) => {
  const summary = Object.entries(apiCallLog.counts).map(([endpoint, count]) => {
    const lats = apiCallLog.latencies[endpoint] || [];
    const avg  = lats.length ? Math.round(lats.reduce((a,b)=>a+b,0)/lats.length) : 0;
    const max  = lats.length ? Math.max(...lats) : 0;
    const errors = apiCallLog.errors[endpoint] || 0;
    return { endpoint, count, avgMs: avg, maxMs: max, errors, errorRate: count ? Math.round((errors/count)*100) : 0 };
  }).sort((a,b) => b.count - a.count);
  res.json({ success: true, totalCalls: Object.values(apiCallLog.counts).reduce((a,b)=>a+b,0), trackedSince: new Date(apiCallLog.lastReset).toISOString(), endpoints: summary });
});

// ── GET /api/admin/app-health ─────────────────────────────────────────────────
router.get('/app-health', async (req, res) => {
  const checks = {};
  const t0 = Date.now();
  try { await mongoose.connection.db.admin().ping(); checks.mongodb = { status:'ok', ms: Date.now()-t0 }; }
  catch(err) { checks.mongodb = { status:'error', error: err.message }; }
  const t1 = Date.now();
  try {
    const r = await fetch(`${process.env.QUESTION_GENERATOR_URL||'http://localhost:3001'}/api/generate`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({subject:'Maths',difficulty:'Easy',questionTypes:['multiple_choice'],count:1,grade:'Grade 5-6 (Ages 10-12)'}), signal:AbortSignal.timeout(8000) });
    checks.questionGenerator = { status: r.ok?'ok':'degraded', httpStatus: r.status, ms: Date.now()-t1 };
  } catch(err) { checks.questionGenerator = { status:'error', error: err.message, ms: Date.now()-t1 }; }
  const mem = process.memoryUsage();
  checks.memory = { status: mem.rss < 400*1024*1024 ? 'ok' : 'warning', rssMB: Math.round(mem.rss/1024/1024), heapUsedMB: Math.round(mem.heapUsed/1024/1024) };
  const overall = Object.values(checks).every(c=>c.status==='ok') ? 'healthy' : Object.values(checks).some(c=>c.status==='error') ? 'degraded' : 'warning';
  res.json({ success:true, status:overall, uptime:Math.floor(process.uptime()), uptimeHuman:formatUptime(process.uptime()), nodeVersion:process.version, env:process.env.NODE_ENV, checks, timestamp:new Date().toISOString() });
});

// ── GET /api/admin/stats ──────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  const [qTotal, qBySubject, uTotal, aTotal] = await Promise.all([
    Question.countDocuments(),
    Question.aggregate([{ $group: { _id: { subject:'$subject', level:'$level' }, count:{ $sum:1 } } }, { $sort: { '_id.subject':1, '_id.level':1 } }]),
    User.countDocuments(), Attempt.countDocuments(),
  ]);
  res.json({ success:true, questions:{ total:qTotal, breakdown:qBySubject }, users:uTotal, attempts:aTotal, questionGeneratorUrl: process.env.QUESTION_GENERATOR_URL||'http://localhost:3001' });
});

// ── POST /api/admin/notify ────────────────────────────────────────────────────
router.post('/notify', async (req, res) => {
  const { userId, segment, type='system', title, body, emoji='🔔', data={} } = req.body;
  if (!title || !body) return res.status(400).json({ success:false, message:'title and body required.' });
  try {
    let userIds = [];
    if (userId) { userIds = [userId]; }
    else if (segment === 'all') { userIds = (await User.find({ isActive:true }).select('_id')).map(u=>u._id); }
    else if (segment === 'children') { userIds = (await User.find({ isActive:true, role:'child' }).select('_id')).map(u=>u._id); }
    else if (segment === 'parents') { userIds = (await User.find({ isActive:true, role:'parent' }).select('_id')).map(u=>u._id); }
    else return res.status(400).json({ success:false, message:'Provide userId or segment.' });
    const notifs = await Notification.insertMany(userIds.map(uid => ({ userId:uid, type, title, body, emoji, data })));
    res.json({ success:true, sent: notifs.length });
  } catch(err) { res.status(500).json({ success:false, message:err.message }); }
});

// ── POST /api/admin/qg-health ─────────────────────────────────────────────────
router.post('/qg-health', async (req, res) => {
  const url = `${process.env.QUESTION_GENERATOR_URL||'http://localhost:3001'}/api/generate`;
  const start = Date.now();
  try {
    const response = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({subject:'Maths',difficulty:'Easy',questionTypes:['multiple_choice'],count:1,grade:'Grade 5-6 (Ages 10-12)'}), signal:AbortSignal.timeout(10000) });
    const data = await response.json().catch(()=>({}));
    res.json({ success:response.ok, status:response.status, responseMs:Date.now()-start, questionsReturned:(data.exercise_bank||data.questions||[]).length, url });
  } catch(err) { res.json({ success:false, error:err.message, responseMs:Date.now()-start, url }); }
});

// ── POST /api/admin/bulk-generate ─────────────────────────────────────────────
router.post('/bulk-generate', async (req, res) => {
  const { subjects=['maths','english','verbal','nonverbal'], levels=[1,2,3,4,5], countPerBatch=10 } = req.body;
  res.setHeader('Content-Type','text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding','chunked');
  res.flushHeaders();
  let totalSaved=0, totalSkipped=0;
  try {
    res.write(`🧙 Starting bulk generation...\n`);
    for (const subject of subjects) {
      for (const level of levels) {
        try {
          res.write(`📚 ${subject} Level ${level}... `);
          const questions = await generateQuestion({ subject, level, count: countPerBatch });
          let saved=0;
          for (const q of questions) {
            if (q.sourceId) { const exists = await Question.findOne({ sourceId:q.sourceId }); if (exists) { totalSkipped++; continue; } }
            await Question.create(q); saved++; totalSaved++;
          }
          res.write(`✅ saved ${saved}\n`);
        } catch(err) { res.write(`⚠️ failed: ${err.message}\n`); }
      }
    }
    res.write(`\n🎉 Done! Saved: ${totalSaved}, Skipped: ${totalSkipped}\n`);
    res.end();
  } catch(err) { res.write(`❌ ${err.message}\n`); res.end(); }
});

function formatUptime(s) {
  const d=Math.floor(s/86400), h=Math.floor((s%86400)/3600), m=Math.floor((s%3600)/60);
  return `${d}d ${h}h ${m}m`;
}

module.exports = router;
module.exports.trackApiCall = trackApiCall;
