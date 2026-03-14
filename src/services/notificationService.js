/**
 * Notification Service
 * Creates in-app notifications and sends email alerts.
 * Called from: questions.js (badges, XP, level up), auth.js (login), server.js (cron jobs)
 */

const Notification = require('../models/Notification');
const { sendStreakReminderEmail, sendBadgeEmail, sendStreakMilestoneEmail } = require('./emailService');

// ── Create a notification ──────────────────────────────────────────────────────
async function createNotification(userId, type, title, body, emoji = '🔔', data = {}) {
  try {
    const notif = await Notification.create({ userId, type, title, body, emoji, data });
    return notif;
  } catch (err) {
    console.error('createNotification error:', err.message);
    return null;
  }
}

// ── Streak notifications ───────────────────────────────────────────────────────
async function notifyStreakMilestone(user) {
  const milestones = { 3: '3 days', 7: '7 days', 14: '2 weeks', 30: '1 month', 50: '50 days', 100: '100 days' };
  const label = milestones[user.streak];
  if (!label) return;

  await createNotification(
    user._id,
    'streak_milestone',
    `🔥 ${label} streak!`,
    `Amazing! You've practised for ${label} in a row. You're on fire, ${user.displayName}!`,
    '🔥',
    { streak: user.streak }
  );

  // Also send email for major milestones
  if ([7, 30, 100].includes(user.streak) && user.email) {
    sendStreakMilestoneEmail(user.email, user.displayName, user.streak).catch(console.error);
  }
}

async function createStreakReminders(usersAtRisk) {
  // Called by cron — users who haven't practised today
  const results = [];
  for (const user of usersAtRisk) {
    const notif = await createNotification(
      user._id,
      'streak_reminder',
      `⏰ Don't break your ${user.streak}-day streak!`,
      `You haven't practised today, ${user.displayName}. Jump in for just 5 minutes to keep your streak alive!`,
      '⏰',
      { streak: user.streak, reminderType: 'daily' }
    );
    if (notif) results.push(notif);
  }
  return results;
}

// ── Badge notifications ────────────────────────────────────────────────────────
async function notifyBadgeEarned(user, badge) {
  await createNotification(
    user._id,
    'badge_earned',
    `${badge.emoji} New badge: ${badge.name}!`,
    badge.description,
    badge.emoji,
    { badge }
  );

  if (user.email) {
    sendBadgeEmail(user.email, user.displayName, badge).catch(console.error);
  }
}

// ── XP milestone notifications ─────────────────────────────────────────────────
async function notifyXpMilestone(user, newXp) {
  const milestones = [500, 1000, 2500, 5000, 10000];
  for (const m of milestones) {
    if (newXp >= m && (newXp - 15) < m) { // just crossed this milestone
      await createNotification(
        user._id,
        'xp_milestone',
        `⚡ ${m.toLocaleString()} XP reached!`,
        `Incredible work, ${user.displayName}! You've earned ${m.toLocaleString()} XP. You're becoming a true wizard!`,
        '⚡',
        { xp: m }
      );
      break;
    }
  }
}

// ── Level up notification ──────────────────────────────────────────────────────
async function notifyLevelUp(user, subject, newLevel) {
  const subjectEmoji = { maths:'🔢', english:'📖', verbal:'💬', nonverbal:'🔷' };
  await createNotification(
    user._id,
    'level_up',
    `${subjectEmoji[subject] || '⬆️'} Level ${newLevel} in ${subject}!`,
    `Brilliant! You've reached Level ${newLevel} in ${subject.charAt(0).toUpperCase() + subject.slice(1)}. New challenges await!`,
    '🎯',
    { subject, level: newLevel }
  );
}

// ── Weak topic alert ───────────────────────────────────────────────────────────
async function notifyWeakTopic(user, subject, topic, accuracy) {
  await createNotification(
    user._id,
    'weak_topic_alert',
    `💪 Focus needed: ${topic}`,
    `Your accuracy in ${topic} (${subject}) is ${accuracy}%. A little extra practice here will make a big difference!`,
    '💪',
    { subject, topic, accuracy }
  );
}

// ── Leaderboard rank change ────────────────────────────────────────────────────
async function notifyRankImprovement(user, oldRank, newRank) {
  if (newRank >= oldRank) return;
  await createNotification(
    user._id,
    'leaderboard_change',
    `🏆 You climbed to #${newRank}!`,
    `You moved up ${oldRank - newRank} places on the leaderboard. Keep going!`,
    '🏆',
    { oldRank, newRank }
  );
}

// ── New questions available ────────────────────────────────────────────────────
async function notifyNewQuestions(userId, examType, count) {
  await createNotification(
    userId,
    'new_questions',
    `✨ ${count} new questions added!`,
    `Fresh ${examType} exam questions are waiting for you. Ready to practise?`,
    '✨',
    { examType, count }
  );
}

module.exports = {
  createNotification,
  notifyStreakMilestone,
  createStreakReminders,
  notifyBadgeEarned,
  notifyXpMilestone,
  notifyLevelUp,
  notifyWeakTopic,
  notifyRankImprovement,
  notifyNewQuestions,
};
