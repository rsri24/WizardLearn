const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Attempt = require('../models/Attempt');
const { authenticate, requireRole } = require('../middleware/auth');

// ─── GET /api/progress/me ────────────────────────────────────────────────────
router.get('/me', authenticate, async (req, res) => {
  try {
    const userId = req.user._id;

    // Last 7 days activity
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const weeklyAttempts = await Attempt.aggregate([
      { $match: { userId, createdAt: { $gte: sevenDaysAgo } } },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        count: { $sum: 1 },
        correct: { $sum: { $cond: ['$isCorrect', 1, 0] } },
        xp: { $sum: '$xpEarned' },
      }},
      { $sort: { _id: 1 } },
    ]);

    // Subject breakdown
    const subjectStats = await Attempt.aggregate([
      { $match: { userId } },
      { $group: {
        _id: '$subject',
        total: { $sum: 1 },
        correct: { $sum: { $cond: ['$isCorrect', 1, 0] } },
        avgTime: { $avg: '$timeSpent' },
        xpEarned: { $sum: '$xpEarned' },
      }},
    ]);

    // Weak topics (lowest accuracy, min 5 attempts)
    const topicStats = await Attempt.aggregate([
      { $match: { userId } },
      { $group: {
        _id: { subject: '$subject', topic: '$topic' },
        total: { $sum: 1 },
        correct: { $sum: { $cond: ['$isCorrect', 1, 0] } },
      }},
      { $match: { total: { $gte: 5 } } },
      { $addFields: { accuracy: { $divide: ['$correct', '$total'] } } },
      { $sort: { accuracy: 1 } },
      { $limit: 5 },
    ]);

    res.json({
      success: true,
      user: {
        xp: req.user.xp,
        level: req.user.level,
        streak: req.user.streak,
        totalQuestionsAnswered: req.user.totalQuestionsAnswered,
        totalCorrectAnswers: req.user.totalCorrectAnswers,
        overallAccuracy: req.user.overallAccuracy,
        badges: req.user.badges,
        progress: req.user.progress,
      },
      weeklyActivity: weeklyAttempts,
      subjectStats,
      weakTopics: topicStats,
    });
  } catch (err) {
    console.error('Progress error:', err);
    res.status(500).json({ success: false, message: 'Could not load progress.' });
  }
});

// ─── GET /api/progress/child/:childId (Parent only) ──────────────────────────
router.get('/child/:childId', authenticate, requireRole('parent'), async (req, res) => {
  try {
    const child = await User.findById(req.params.childId).select('-otp');
    if (!child) return res.status(404).json({ success: false, message: 'Child not found.' });

    // Verify this child belongs to the parent
    if (String(child.parentId) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [weeklyAttempts, subjectStats, weakTopics] = await Promise.all([
      Attempt.aggregate([
        { $match: { userId: child._id, createdAt: { $gte: sevenDaysAgo } } },
        { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
          correct: { $sum: { $cond: ['$isCorrect', 1, 0] } },
          xp: { $sum: '$xpEarned' },
          duration: { $sum: '$timeSpent' },
        }},
        { $sort: { _id: 1 } },
      ]),
      Attempt.aggregate([
        { $match: { userId: child._id } },
        { $group: {
          _id: '$subject',
          total: { $sum: 1 },
          correct: { $sum: { $cond: ['$isCorrect', 1, 0] } },
        }},
      ]),
      Attempt.aggregate([
        { $match: { userId: child._id } },
        { $group: {
          _id: { subject: '$subject', topic: '$topic' },
          total: { $sum: 1 },
          correct: { $sum: { $cond: ['$isCorrect', 1, 0] } },
        }},
        { $match: { total: { $gte: 5 } } },
        { $addFields: { accuracy: { $divide: ['$correct', '$total'] } } },
        { $sort: { accuracy: 1 } },
        { $limit: 5 },
      ]),
    ]);

    // Total time this week
    const totalSecondsThisWeek = weeklyAttempts.reduce((s, d) => s + (d.duration || 0), 0);

    res.json({
      success: true,
      child: {
        id: child._id,
        displayName: child.displayName,
        avatar: child.avatar,
        age: child.age,
        schoolYear: child.schoolYear,
        targetExam: child.targetExam,
        xp: child.xp,
        level: child.level,
        streak: child.streak,
        totalQuestionsAnswered: child.totalQuestionsAnswered,
        overallAccuracy: child.overallAccuracy,
        badges: child.badges,
        progress: child.progress,
        settings: child.settings,
      },
      weeklyActivity: weeklyAttempts,
      weeklyTimeSeconds: totalSecondsThisWeek,
      subjectStats,
      weakTopics,
    });
  } catch (err) {
    console.error('Child progress error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─── GET /api/progress/leaderboard ───────────────────────────────────────────
router.get('/leaderboard', authenticate, async (req, res) => {
  const scope = req.query.scope || 'class'; // class | school | national
  const subject = req.query.subject; // optional filter
  const period = req.query.period || 'week'; // week | month | all

  try {
    let dateFilter = {};
    if (period === 'week') dateFilter = { createdAt: { $gte: new Date(Date.now() - 7*24*60*60*1000) } };
    if (period === 'month') dateFilter = { createdAt: { $gte: new Date(Date.now() - 30*24*60*60*1000) } };

    const matchStage = { ...dateFilter };
    if (subject) matchStage.subject = subject;

    // Get top 50 users by XP earned in period
    const topUsers = await Attempt.aggregate([
      { $match: { isCorrect: true, ...matchStage } },
      { $group: { _id: '$userId', xpEarned: { $sum: '$xpEarned' }, questionsCorrect: { $sum: 1 } } },
      { $sort: { xpEarned: -1 } },
      { $limit: 50 },
    ]);

    const userIds = topUsers.map(u => u._id);
    const users = await User.find({ _id: { $in: userIds } }).select('displayName avatar avatarName xp level schoolYear');
    const userMap = Object.fromEntries(users.map(u => [String(u._id), u]));

    const leaderboard = topUsers.map((entry, idx) => {
      const u = userMap[String(entry._id)];
      if (!u) return null;
      return {
        rank: idx + 1,
        userId: entry._id,
        displayName: u.displayName,
        avatar: u.avatar,
        xp: entry.xpEarned,
        totalXp: u.xp,
        level: u.level,
        schoolYear: u.schoolYear,
        isMe: String(entry._id) === String(req.user._id),
      };
    }).filter(Boolean);

    // Find current user's position if not in top 50
    let myRank = leaderboard.find(l => l.isMe)?.rank;
    if (!myRank) {
      const myXp = await Attempt.aggregate([
        { $match: { userId: req.user._id, isCorrect: true, ...matchStage } },
        { $group: { _id: null, xpEarned: { $sum: '$xpEarned' } } },
      ]);
      myRank = { rank: '50+', xp: myXp[0]?.xpEarned || 0, isMe: true, displayName: req.user.displayName, avatar: req.user.avatar };
    }

    res.json({ success: true, leaderboard, myRank });
  } catch (err) {
    console.error('Leaderboard error:', err);
    res.status(500).json({ success: false, message: 'Could not load leaderboard.' });
  }
});

module.exports = router;
