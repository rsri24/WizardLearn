/**
 * Help Service
 * Generates kid-friendly, step-by-step explanations for any question.
 * Uses QuestionGenerator / Anthropic API to create detailed worked solutions.
 */

const QG_BASE_URL = process.env.QUESTION_GENERATOR_URL || 'http://localhost:3001';

// ── Generate full explanation for a question ──────────────────────────────────
async function generateExplanation({ questionText, options, correctIndex, subject, level, topic, existingHint, existingExplanation }) {
  const correctAnswer = options[correctIndex];

  // If we have a good explanation already, enhance it
  if (existingExplanation && existingExplanation.length > 50) {
    return buildResponse(existingHint, existingExplanation, correctAnswer, subject, topic);
  }

  // Try to generate a better explanation via Claude
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey && !apiKey.startsWith('sk-ant-your')) {
    try {
      const prompt = buildPrompt(questionText, options, correctIndex, subject, level, topic);
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 800,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: AbortSignal.timeout(12000),
      });

      if (response.ok) {
        const data = await response.json();
        const text = data.content?.[0]?.text || '';
        const cleaned = text.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        return {
          hint:         parsed.hint || existingHint || 'Think carefully about each option.',
          explanation:  parsed.explanation || existingExplanation || '',
          stepByStep:   parsed.steps || [],
          relatedTopics:parsed.relatedTopics || [],
          correctAnswer,
          encouragement: parsed.encouragement || getEncouragement(),
        };
      }
    } catch (err) {
      console.warn('Help AI generation failed, using fallback:', err.message);
    }
  }

  // Fallback — use what we have
  return buildResponse(existingHint, existingExplanation, correctAnswer, subject, topic);
}

function buildPrompt(questionText, options, correctIndex, subject, level, topic) {
  return `You are a friendly, encouraging tutor helping a child aged 7-12 understand a ${subject} question.

Question: ${questionText}
Options: ${options.map((o, i) => `${['A','B','C','D'][i]}) ${o}`).join(', ')}
Correct answer: ${options[correctIndex]}
Subject: ${subject}, Topic: ${topic || 'general'}, Level: ${level}/5

Generate a child-friendly explanation. Respond ONLY with valid JSON (no markdown):
{
  "hint": "A one-sentence clue that helps without giving the answer away",
  "explanation": "2-3 sentences explaining WHY the correct answer is right, in simple language",
  "steps": ["Step 1: ...", "Step 2: ...", "Step 3: ..."],
  "relatedTopics": ["topic1", "topic2"],
  "encouragement": "A short motivational message like 'You'll get it next time!'"
}`;
}

function buildResponse(hint, explanation, correctAnswer, subject, topic) {
  return {
    hint:          hint || 'Think carefully about each option and eliminate the ones you know are wrong.',
    explanation:   explanation || `The correct answer is: ${correctAnswer}. Review your ${subject} notes on ${topic || 'this topic'} to understand why.`,
    stepByStep:    [],
    relatedTopics: [],
    correctAnswer,
    encouragement: getEncouragement(),
  };
}

const ENCOURAGEMENTS = [
  "Don't worry — every wizard makes mistakes! 🧙",
  "You'll get it next time! Practice makes perfect ⚡",
  "Great question to ask for help — that's how you learn! 🌟",
  "Even the greatest wizards needed help at first! 💫",
  "Understanding this now means you'll nail it on the test! 🎯",
];

function getEncouragement() {
  return ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)];
}

module.exports = { generateExplanation };
