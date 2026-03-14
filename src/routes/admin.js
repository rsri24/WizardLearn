/**
 * Admin routes — protected by ADMIN_SECRET header
 * These are NOT exposed to the public frontend.
 *
 * POST /api/admin/bulk-generate
 *   Calls QuestionGenerator bulk endpoint and saves all questions to MongoDB.
 *   Run this once (or via a cron job) to pre-populate the question bank.
 *
 * GET  /api/admin/stats
 *   Returns question bank and user counts.
 *
 * POST /api/admin/qg-health
 *   Checks connectivity to the QuestionGenerator service.
 */

const express  = require('express');
const router   = express.Router();
const Question = require('../models/Question');
const User     = require('../models/User');
const Attempt  = require('../models/Attempt');
const { generateBulk, generateQuestion } = require('../services/questionService');

// ── Admin auth middleware ─────────────────────────────────────────────────────
function adminOnly(req, res, next) {
  const secret = req.headers['x-admin-secret'] || req.query.secret;
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ success: false, message: 'Admin access denied.' });
  }
  next();
}

router.use(adminOnly);

// ── POST /api/admin/bulk-generate ─────────────────────────────────────────────
// Calls QuestionGenerator, stores results in MongoDB.
// Safe to re-run — duplicate sourceId's are skipped.
router.post('/bulk-generate', async (req, res) => {
  const {
    subjects      = ['maths', 'english', 'verbal', 'nonverbal'],
    levels        = [1, 2, 3, 4, 5],
    countPerBatch = 10,
  } = req.body;

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.flushHeaders();

  let totalSaved = 0;
  let totalSkipped = 0;

  try {
    res.write(`🧙 Starting bulk generation via QuestionGenerator...\n`);
    res.write(`   Subjects: ${subjects.join(', ')}\n`);
    res.write(`   Levels: ${levels.join(', ')}\n`);
    res.write(`   Count per batch: ${countPerBatch}\n\n`);

    for (const subject of subjects) {
      for (const level of levels) {
        try {
          res.write(`📚 ${subject} Level ${level}... `);
          const questions = await generateQuestion({ subject, level, count: countPerBatch });

          let saved = 0;
          for (const q of questions) {
            // Skip if we already have this sourceId
            if (q.sourceId) {
              const exists = await Question.findOne({ sourceId: q.sourceId });
              if (exists) { totalSkipped++; continue; }
            }
            await Question.create(q);
            saved++;
            totalSaved++;
          }

          res.write(`✅ saved ${saved} questions\n`);
        } catch (err) {
          res.write(`⚠️  failed: ${err.message}\n`);
        }
      }
    }

    res.write(`\n🎉 Done! Saved: ${totalSaved}, Skipped (duplicates): ${totalSkipped}\n`);
    res.write(`Total questions in DB: ${await Question.countDocuments()}\n`);
    res.end();
  } catch (err) {
    res.write(`\n❌ Fatal error: ${err.message}\n`);
    res.end();
  }
});

// ── GET /api/admin/stats ──────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  const [qTotal, qBySubject, uTotal, aTotal] = await Promise.all([
    Question.countDocuments(),
    Question.aggregate([
      { $group: { _id: { subject: '$subject', level: '$level' }, count: { $sum: 1 } } },
      { $sort: { '_id.subject': 1, '_id.level': 1 } },
    ]),
    User.countDocuments(),
    Attempt.countDocuments(),
  ]);

  res.json({
    success: true,
    questions: { total: qTotal, breakdown: qBySubject },
    users: uTotal,
    attempts: aTotal,
    questionGeneratorUrl: process.env.QUESTION_GENERATOR_URL || 'http://localhost:3001',
  });
});

// ── POST /api/admin/qg-health ─────────────────────────────────────────────────
router.post('/qg-health', async (req, res) => {
  const url = `${process.env.QUESTION_GENERATOR_URL || 'http://localhost:3001'}/api/generate`;
  const start = Date.now();

  try {
    const response = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ subject: 'Maths', difficulty: 'Easy', questionTypes: ['multiple_choice'], count: 1, grade: 'Grade 5-6 (Ages 10-12)' }),
      signal:  AbortSignal.timeout(10000),
    });

    const elapsed = Date.now() - start;
    const data    = await response.json().catch(() => ({}));
    const count   = (data.exercise_bank || data.questions || []).length;

    res.json({
      success:      response.ok,
      status:       response.status,
      responseMs:   elapsed,
      questionsReturned: count,
      url,
    });
  } catch (err) {
    res.json({
      success:    false,
      error:      err.message,
      responseMs: Date.now() - start,
      url,
    });
  }
});

module.exports = router;
