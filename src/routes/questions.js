const express = require('express');
const router = express.Router();
const { body, query, validationResult } = require('express-validator');
const Question = require('../models/Question');
const Attempt = require('../models/Attempt');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');
const { generateQuestion } = require('../services/questionService');
const { v4: uuidv4 } = require('uuid');

const SUBJECTS = ['maths','english','verbal','nonverbal'];
const BADGE_RULES = [
  { id:'first_correct', check: (u) => u.totalCorrectAnswers === 1, emoji:'⭐', name:'First Spell Cast', desc:'Got your first question right!' },
  { id:'streak_3',      check: (u) => u.streak >= 3,               emoji:'🔥', name:'3-Day Streak',    desc:'Practised 3 days in a row!' },
  { id:'streak_7',      check: (u) => u.streak >= 7,               emoji:'🔥', name:'Week Wizard',      desc:'7-day practice streak!' },
  { id:'xp_500',        check: (u) => u.xp >= 500,                 emoji:'💫', name:'XP Apprentice',   desc:'Earned 500 XP!' },
  { id:'xp_1000',       check: (u) => u.xp >= 1000,                emoji:'💎', name:'XP Sorcerer',     desc:'Earned 1000 XP!' },
  { id:'xp_5000',       check: (u) => u.xp >= 5000,                emoji:'👑', name:'Grand Wizard',    desc:'Earned 5000 XP!' },
  { id:'q_50',          check: (u) => u.totalQuestionsAnswered >= 50,  emoji:'📚', name:'Bookworm',    desc:'Answered 50 questions!' },
  { id:'q_200',         check: (u) => u.totalQuestionsAnswered >= 200, emoji:'🧙', name:'Scholar',     desc:'Answered 200 questions!' },
  { id:'accuracy_90',   check: (u) => u.overallAccuracy >= 90 && u.totalQuestionsAnswered >= 20, emoji:'🎯', name:'Sharpshooter', desc:'90%+ accuracy over 20+ questions!' },
];

// ─── GET /api/questions ──────────────────────────────────────────────────────
// Fetch questions — from DB first, generate via AI if not enough
router.get('/', authenticate, [
  query('subject').isIn(SUBJECTS),
  query('level').optional().isInt({ min:1, max:5 }),
  query('count').optional().isInt({ min:1, max:20 }),
  query('examType').optional().isString(),
  query('topic').optional().isString(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  const subject = req.query.subject;
  const level = parseInt(req.query.level) || getUserLevel(req.user, subject);
  const count = parseInt(req.query.count) || 5;
  const examType = req.query.examType || 'general';
  const topic = req.query.topic;

  try {
    // Build DB query
    const dbQuery = { subject, level, isActive: true };
    if (examType !== 'general') dbQuery.examType = examType;
    if (topic) dbQuery.topic = topic;

    // Get questions user hasn't seen recently
    const recentAttempts = await Attempt.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(50).distinct('questionId');
    if (recentAttempts.length > 0) dbQuery._id = { $nin: recentAttempts };

    let questions = await Question.find(dbQuery).limit(count * 2);

    // If not enough in DB → generate via AI
    const needed = count - questions.length;
    if (needed > 0) {
      const aiQs = await generateQuestion({ subject, level, topic, examType, count: needed });

      // Save AI questions to DB for reuse
      const saved = await Question.insertMany(aiQs.map(q => ({
        ...q, subject, level, examType: examType || 'general',
      })), { ordered: false }).catch(() => []);

      questions = [...questions, ...saved];
    }

    // Shuffle and return required count
    const shuffled = questions.sort(() => Math.random() - 0.5).slice(0, count);

    // Strip correct answer from response (sent separately)
    const safeQuestions = shuffled.map(q => ({
      _id: q._id,
      questionText: q.questionText,
      options: q.options,
      subject: q.subject,
      level: q.level,
      topic: q.topic,
      xpReward: q.xpReward,
      difficulty: q.difficulty,
    }));

    res.json({ success: true, questions: safeQuestions, sessionId: uuidv4() });
  } catch (err) {
    console.error('Get questions error:', err);
    res.status(500).json({ success: false, message: 'Could not load questions.' });
  }
});

// ─── GET /api/questions/:id/hint ─────────────────────────────────────────────
router.get('/:id/hint', authenticate, async (req, res) => {
  try {
    const q = await Question.findById(req.params.id).select('hint');
    if (!q) return res.status(404).json({ success: false, message: 'Question not found.' });
    res.json({ success: true, hint: q.hint || 'Think carefully about each option.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─── POST /api/questions/:id/answer ──────────────────────────────────────────
router.post('/:id/answer', authenticate, [
  body('chosenIndex').isInt({ min:0, max:3 }),
  body('sessionId').optional().isString(),
  body('timeSpent').optional().isInt({ min:0 }),
  body('hintUsed').optional().isBoolean(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  const { chosenIndex, sessionId, timeSpent, hintUsed } = req.body;

  try {
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ success: false, message: 'Question not found.' });

    const isCorrect = chosenIndex === question.correctIndex;
    const xpEarned = isCorrect ? question.xpReward : 0;

    // Save attempt
    await Attempt.create({
      userId: req.user._id,
      questionId: question._id,
      subject: question.subject,
      level: question.level,
      topic: question.topic,
      examType: question.examType,
      chosenIndex,
      isCorrect,
      xpEarned,
      timeSpent,
      hintUsed: hintUsed || false,
      sessionId,
    });

    // Update question stats
    question.timesAnswered += 1;
    if (isCorrect) question.timesCorrect += 1;
    await question.save();

    // Update user stats
    const user = req.user;
    user.totalQuestionsAnswered += 1;
    if (isCorrect) {
      user.totalCorrectAnswers += 1;
      user.xp += xpEarned;
    }
    user.updateStreak();
    user.calculateLevel();

    // Update subject progress
    const prog = user.getSubjectProgress(question.subject);
    prog.questionsAnswered += 1;
    if (isCorrect) prog.correctAnswers += 1;
    prog.accuracy = Math.round((prog.correctAnswers / prog.questionsAnswered) * 100);

    // Check for new badges
    const newBadges = [];
    for (const rule of BADGE_RULES) {
      const alreadyHas = user.badges.some(b => b.name === rule.name);
      if (!alreadyHas && rule.check(user)) {
        const badge = { name: rule.name, emoji: rule.emoji, description: rule.desc, earnedAt: new Date() };
        user.badges.push(badge);
        newBadges.push(badge);
      }
    }

    await user.save();

    res.json({
      success: true,
      isCorrect,
      correctIndex: question.correctIndex,
      explanation: question.explanation,
      xpEarned,
      totalXp: user.xp,
      level: user.level,
      streak: user.streak,
      newBadges,
    });
  } catch (err) {
    console.error('Answer error:', err);
    res.status(500).json({ success: false, message: 'Could not record answer.' });
  }
});

// ─── POST /api/questions/generate ────────────────────────────────────────────
// On-demand AI generation endpoint (used by "New Question" button)
router.post('/generate', authenticate, [
  body('subject').isIn(SUBJECTS),
  body('level').optional().isInt({ min:1, max:5 }),
  body('topic').optional().isString(),
  body('examType').optional().isString(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  const { subject, topic, examType } = req.body;
  const level = req.body.level || getUserLevel(req.user, subject);

  try {
    const [q] = await generateQuestion({ subject, level, topic, examType, count: 1 });

    // Save to DB
    const saved = await Question.create({ ...q, subject, level, examType: examType || 'general' });

    res.json({
      success: true,
      question: {
        _id: saved._id,
        questionText: saved.questionText,
        options: saved.options,
        subject: saved.subject,
        level: saved.level,
        topic: saved.topic,
        xpReward: saved.xpReward,
        difficulty: saved.difficulty,
      },
    });
  } catch (err) {
    console.error('Generate error:', err);
    res.status(500).json({ success: false, message: 'Could not generate question.' });
  }
});

function getUserLevel(user, subject) {
  const prog = user.progress?.find(p => p.subject === subject);
  return prog?.level || 1;
}

module.exports = router;
