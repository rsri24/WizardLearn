const express  = require('express');
const router   = express.Router();
const Question   = require('../models/Question');
const HelpRequest = require('../models/HelpRequest');
const { authenticate } = require('../middleware/auth');
const { generateExplanation } = require('../services/helpService');

// ── GET /api/help/:questionId ──────────────────────────────────────────────────
// Returns hint + full explanation + step-by-step + related topics
// This is what the Help button calls
router.get('/:questionId', authenticate, async (req, res) => {
  try {
    const question = await Question.findById(req.params.questionId);
    if (!question) {
      return res.status(404).json({ success: false, message: 'Question not found.' });
    }

    // Generate / retrieve explanation
    const helpData = await generateExplanation({
      questionText:       question.questionText,
      options:            question.options,
      correctIndex:       question.correctIndex,
      subject:            question.subject,
      level:              question.level,
      topic:              question.topic,
      existingHint:       question.hint,
      existingExplanation:question.explanation,
    });

    // Log this help request for analytics
    HelpRequest.create({
      userId:       req.user._id,
      questionId:   question._id,
      subject:      question.subject,
      level:        question.level,
      topic:        question.topic,
      questionText: question.questionText,
      hintText:     helpData.hint,
      explanation:  helpData.explanation,
      stepByStep:   helpData.stepByStep,
      relatedTopics:helpData.relatedTopics,
      aiExplanation:helpData.explanation,
    }).catch(console.error);

    res.json({ success: true, help: helpData });
  } catch (err) {
    console.error('Help route error:', err);
    res.status(500).json({ success: false, message: 'Could not load help.' });
  }
});

// ── PATCH /api/help/:questionId/feedback ──────────────────────────────────────
// Kid rates whether the explanation was helpful (thumb up/down)
router.patch('/:questionId/feedback', authenticate, async (req, res) => {
  try {
    const { helpful } = req.body;
    await HelpRequest.findOneAndUpdate(
      { questionId: req.params.questionId, userId: req.user._id },
      { helpful },
      { sort: { createdAt: -1 } }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// ── GET /api/help/topic/:subject/:topic ────────────────────────────────────────
// Get general revision notes on a topic (for the "Learn more" section)
router.get('/topic/:subject/:topic', authenticate, async (req, res) => {
  try {
    const { subject, topic } = req.params;

    // Find questions on this topic to use as examples
    const examples = await Question.find({ subject, topic, isActive: true }).limit(3).select('questionText options correctIndex explanation');

    res.json({
      success: true,
      subject,
      topic,
      examples: examples.map(q => ({
        question: q.questionText,
        answer:   q.options[q.correctIndex],
        explanation: q.explanation,
      })),
      tip: `Practice more ${topic} questions to improve your score!`,
    });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

module.exports = router;
