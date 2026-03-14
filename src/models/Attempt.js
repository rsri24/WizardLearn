const mongoose = require('mongoose');

const attemptSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
  subject: { type: String, required: true },
  level: Number,
  topic: String,
  examType: { type: String, default: 'general' },
  chosenIndex: { type: Number, required: true },
  isCorrect: { type: Boolean, required: true },
  xpEarned: { type: Number, default: 0 },
  timeSpent: { type: Number }, // seconds
  hintUsed: { type: Boolean, default: false },
  sessionId: { type: String }, // groups attempts into a session
}, {
  timestamps: true,
});

attemptSchema.index({ userId: 1, createdAt: -1 });
attemptSchema.index({ userId: 1, subject: 1 });

module.exports = mongoose.model('Attempt', attemptSchema);
