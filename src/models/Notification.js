const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type:     {
    type: String,
    enum: [
      'streak_reminder',    // daily practice reminder
      'streak_milestone',   // 7, 14, 30 day streak
      'xp_milestone',       // hit 500, 1000, 5000 XP
      'badge_earned',       // new badge unlocked
      'level_up',           // levelled up in a subject
      'weak_topic_alert',   // accuracy dropped below 60%
      'mock_result',        // mock test completed
      'parent_report',      // weekly report ready
      'new_questions',      // fresh questions added for their exam
      'leaderboard_change', // rank improved
      'system',             // general system message
    ],
    required: true,
  },
  title:    { type: String, required: true },
  body:     { type: String, required: true },
  emoji:    { type: String, default: '🔔' },
  data:     { type: mongoose.Schema.Types.Mixed }, // extra payload (badge name, XP amount, etc.)
  read:     { type: Boolean, default: false, index: true },
  readAt:   { type: Date },
  // Push delivery
  pushed:   { type: Boolean, default: false },
  pushedAt: { type: Date },
}, { timestamps: true });

notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
