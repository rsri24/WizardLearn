const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  subject: {
    type: String,
    enum: ['maths','english','verbal','nonverbal'],
    required: true,
    index: true,
  },
  level: { type: Number, required: true, min: 1, max: 5, index: true },
  topic: { type: String, required: true }, // e.g. "fractions", "analogies"
  examType: { type: String, default: 'general' }, // "general", "kent", "csse", "sutton", etc.

  questionText: { type: String, required: true },
  options: [{ type: String, required: true }], // exactly 4
  correctIndex: { type: Number, required: true, min: 0, max: 3 },
  explanation: { type: String },
  hint: { type: String },

  xpReward: { type: Number, default: 15 },
  difficulty: { type: String, enum: ['easy','medium','hard'], default: 'medium' },

  // AI-generated flag
  aiGenerated: { type: Boolean, default: false },
  aiPromptUsed: { type: String },

  // Stats
  timesAnswered: { type: Number, default: 0 },
  timesCorrect: { type: Number, default: 0 },

  isActive: { type: Boolean, default: true },
}, {
  timestamps: true,
});

questionSchema.index({ subject: 1, level: 1, topic: 1 });
questionSchema.index({ examType: 1, subject: 1 });

// Virtual: difficulty ratio
questionSchema.virtual('successRate').get(function() {
  if (this.timesAnswered === 0) return null;
  return Math.round((this.timesCorrect / this.timesAnswered) * 100);
});

module.exports = mongoose.model('Question', questionSchema);
