const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const progressSchema = new mongoose.Schema({
  subject: { type: String, enum: ['maths','english','verbal','nonverbal'], required: true },
  level: { type: Number, default: 1, min: 1, max: 5 },
  chaptersCompleted: { type: Number, default: 0 },
  totalChapters: { type: Number, default: 24 },
  accuracy: { type: Number, default: 0 },
  questionsAnswered: { type: Number, default: 0 },
  correctAnswers: { type: Number, default: 0 },
}, { _id: false });

const sessionSchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  subject: String,
  questionsAnswered: Number,
  correctAnswers: Number,
  xpEarned: Number,
  duration: Number, // seconds
}, { _id: false });

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  role: { type: String, enum: ['child','parent'], default: 'child' },

  // Profile
  displayName: { type: String, default: 'Wizard' },
  avatar: { type: String, default: '🧙‍♂️' },
  avatarName: { type: String, default: 'Merlin' },
  age: { type: Number, min: 5, max: 18 },
  schoolYear: { type: String },
  targetExam: { type: String },

  // Parent link
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  children: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  // Gamification
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  streak: { type: Number, default: 0 },
  lastActiveDate: { type: Date },
  totalQuestionsAnswered: { type: Number, default: 0 },
  totalCorrectAnswers: { type: Number, default: 0 },

  // Badges/rewards earned
  badges: [{ name: String, emoji: String, earnedAt: Date, description: String }],

  // Subject progress
  progress: [progressSchema],

  // Recent sessions (last 30)
  sessions: [sessionSchema],

  // OTP
  otp: { code: String, expiresAt: Date, attempts: { type: Number, default: 0 } },

  // Settings
  settings: {
    dailyTimeLimit: { type: Number, default: 60 }, // minutes
    reminderTime: { type: String, default: '18:30' },
    weeklyReport: { type: Boolean, default: true },
    musicEnabled: { type: Boolean, default: false },
    voiceFeedback: { type: Boolean, default: true },
  },

  isActive: { type: Boolean, default: true },
}, {
  timestamps: true,
});

// Indexes
userSchema.index({ email: 1 });
userSchema.index({ xp: -1 }); // for leaderboard

// Virtual: accuracy
userSchema.virtual('overallAccuracy').get(function() {
  if (this.totalQuestionsAnswered === 0) return 0;
  return Math.round((this.totalCorrectAnswers / this.totalQuestionsAnswered) * 100);
});

// Auto-calculate level from XP
userSchema.methods.calculateLevel = function() {
  const thresholds = [0, 500, 1200, 2200, 3500, 5000, 7000, 9500, 12500, 16000, 20000];
  let lvl = 1;
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (this.xp >= thresholds[i]) { lvl = i + 1; break; }
  }
  this.level = Math.min(lvl, 10);
  return this.level;
};

// Update streak
userSchema.methods.updateStreak = function() {
  const now = new Date();
  const last = this.lastActiveDate;
  if (!last) { this.streak = 1; }
  else {
    const diffDays = Math.floor((now - last) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) { /* same day, no change */ }
    else if (diffDays === 1) { this.streak += 1; }
    else { this.streak = 1; }
  }
  this.lastActiveDate = now;
};

// Get or initialise subject progress
userSchema.methods.getSubjectProgress = function(subject) {
  let prog = this.progress.find(p => p.subject === subject);
  if (!prog) {
    this.progress.push({ subject, level: 1, accuracy: 0, questionsAnswered: 0, correctAnswers: 0 });
    prog = this.progress[this.progress.length - 1];
  }
  return prog;
};

module.exports = mongoose.model('User', userSchema);
