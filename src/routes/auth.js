const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { generateOtp, sendOtpEmail, sendWelcomeEmail } = require('../services/emailService');
const { signToken, authenticate } = require('../middleware/auth');

const OTP_EXPIRES_MS = (parseInt(process.env.OTP_EXPIRES_MINUTES) || 10) * 60 * 1000;

// ─── POST /api/auth/signup ───────────────────────────────────────────────────
router.post('/signup', [
  body('email').isEmail().normalizeEmail(),
  body('role').isIn(['child','parent']),
  body('age').optional().isInt({ min: 5, max: 18 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  const { email, role, age, schoolYear, targetExam, displayName, avatar, avatarName } = req.body;

  try {
    let user = await User.findOne({ email });
    const isNew = !user;

    if (!user) {
      user = new User({ email, role: role || 'child' });
    }

    // Update profile fields
    if (displayName) user.displayName = displayName;
    if (avatar) user.avatar = avatar;
    if (avatarName) user.avatarName = avatarName;
    if (age) user.age = age;
    if (schoolYear) user.schoolYear = schoolYear;
    if (targetExam) user.targetExam = targetExam;

    // Generate and store OTP
    const otp = generateOtp();
    user.otp = { code: otp, expiresAt: new Date(Date.now() + OTP_EXPIRES_MS), attempts: 0 };
    await user.save();

    await sendOtpEmail(email, otp, user.displayName);

    if (isNew) {
      // Send welcome email async (don't block response)
      sendWelcomeEmail(email, user.displayName).catch(console.error);
    }

    res.json({ success: true, message: 'OTP sent! Check your email.', isNew });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

// ─── POST /api/auth/request-otp ─────────────────────────────────────────────
router.post('/request-otp', [
  body('email').isEmail().normalizeEmail(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Invalid email.' });

  const { email } = req.body;

  try {
    let user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: 'No account found. Please sign up first.' });
    }

    const otp = generateOtp();
    user.otp = { code: otp, expiresAt: new Date(Date.now() + OTP_EXPIRES_MS), attempts: 0 };
    await user.save();
    await sendOtpEmail(email, otp, user.displayName);

    res.json({ success: true, message: 'OTP sent! Check your email.' });
  } catch (err) {
    console.error('OTP request error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─── POST /api/auth/verify-otp ──────────────────────────────────────────────
router.post('/verify-otp', [
  body('email').isEmail().normalizeEmail(),
  body('otp').isLength({ min: 6, max: 6 }).isNumeric(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Invalid input.' });

  const { email, otp } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ success: false, message: 'Account not found.' });

    // Check attempts
    if (user.otp?.attempts >= 5) {
      return res.status(429).json({ success: false, message: 'Too many attempts. Request a new code.' });
    }

    // Validate OTP
    if (!user.otp?.code || user.otp.code !== otp) {
      user.otp.attempts = (user.otp?.attempts || 0) + 1;
      await user.save();
      return res.status(401).json({ success: false, message: 'Incorrect code. Try again.' });
    }

    if (new Date() > user.otp.expiresAt) {
      return res.status(401).json({ success: false, message: 'Code expired. Request a new one.' });
    }

    // Success — clear OTP, update streak
    user.otp = undefined;
    user.updateStreak();
    user.calculateLevel();
    await user.save();

    const token = signToken(user._id);

    res.json({
      success: true,
      token,
      user: sanitiseUser(user),
    });
  } catch (err) {
    console.error('OTP verify error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─── GET /api/auth/me ────────────────────────────────────────────────────────
router.get('/me', authenticate, async (req, res) => {
  res.json({ success: true, user: sanitiseUser(req.user) });
});

// ─── PATCH /api/auth/profile ─────────────────────────────────────────────────
router.patch('/profile', authenticate, async (req, res) => {
  const allowed = ['displayName','avatar','avatarName','age','schoolYear','targetExam','settings'];
  const updates = {};
  allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

  try {
    Object.assign(req.user, updates);
    await req.user.save();
    res.json({ success: true, user: sanitiseUser(req.user) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Could not update profile.' });
  }
});

function sanitiseUser(user) {
  return {
    id: user._id,
    email: user.email,
    role: user.role,
    displayName: user.displayName,
    avatar: user.avatar,
    avatarName: user.avatarName,
    age: user.age,
    schoolYear: user.schoolYear,
    targetExam: user.targetExam,
    xp: user.xp,
    level: user.level,
    streak: user.streak,
    totalQuestionsAnswered: user.totalQuestionsAnswered,
    totalCorrectAnswers: user.totalCorrectAnswers,
    overallAccuracy: user.overallAccuracy,
    badges: user.badges,
    progress: user.progress,
    settings: user.settings,
    createdAt: user.createdAt,
  };
}

module.exports = router;
module.exports.sanitiseUser = sanitiseUser;
