/**
 * ============================================================
 * WizardLearn — Question Service
 * ============================================================
 * All question generation is routed through the owner's
 * QuestionGenerator tool (https://github.com/rsri24/QuestionGenerator)
 * which exposes a POST /api/generate endpoint.
 *
 * The QuestionGenerator tool runs as a separate Node.js service
 * (default: http://localhost:3001) and uses the Anthropic SDK
 * internally — WizardLearn never calls Anthropic directly.
 *
 * Flow:
 *  WizardLearn backend  →  QuestionGenerator service  →  Anthropic API
 *
 * Adapter responsibilities:
 *  1. Map WizardLearn internal params  →  QuestionGenerator API shape
 *  2. Map QuestionGenerator Khan Academy v1 response  →  WizardLearn Question shape
 *  3. Graceful fallback to seeded questions when the service is unreachable
 * ============================================================
 */

// ── Config ────────────────────────────────────────────────────────────────────
const QG_BASE_URL   = process.env.QUESTION_GENERATOR_URL || 'http://localhost:3001';
const QG_API_KEY    = process.env.QUESTION_GENERATOR_KEY || '';   // optional bearer token
const QG_TIMEOUT_MS = parseInt(process.env.QG_TIMEOUT_MS) || 15000;

// ── Mapping tables ────────────────────────────────────────────────────────────

// WizardLearn lowercase  →  QuestionGenerator Title Case
const SUBJECT_MAP = {
  maths:     'Maths',
  english:   'English',
  verbal:    'Verbal Reasoning',
  nonverbal: 'Non-Verbal Reasoning',
};

// WizardLearn level 1-5  →  QuestionGenerator difficulty
const DIFFICULTY_MAP = {
  1: 'Easy',
  2: 'Easy',
  3: 'Medium',
  4: 'Hard',
  5: 'Hard',
};

// Child age  →  grade descriptor QuestionGenerator understands
const GRADE_MAP = {
  7:  'Grade 3-4 (Ages 8-10)',
  8:  'Grade 3-4 (Ages 8-10)',
  9:  'Grade 5-6 (Ages 10-12)',
  10: 'Grade 5-6 (Ages 10-12)',
  11: 'Grade 5-6 (Ages 10-12)',
  12: 'Grade 7-8 (Ages 12-14)',
};
const DEFAULT_GRADE = 'Grade 5-6 (Ages 10-12)';

// Exam style notes appended to the generation request
const EXAM_STYLE_NOTES = {
  kent:            'Kent Test GL Assessment — code breaking, spatial reasoning, MCQ',
  csse:            'CSSE Essex — long comprehension, creative writing, maths reasoning',
  sutton:          'Sutton SET — two-stage, problem solving focus',
  bexley:          'Bexley GL Assessment — word puzzles, arithmetic codes',
  buckinghamshire: 'Buckinghamshire 11+ GL — heavy VR/NVR component',
  warwickshire:    'Warwickshire GL — comprehension and arithmetic word problems',
  birmingham:      'King Edward VI — maths problem solving, reading comprehension',
  trafford:        'Trafford GL — standard multiple-choice reasoning',
  devon:           'Devon GL — English, Maths, NVR combination',
  london:          'London Consortium — creative writing, difficult comprehension',
  general:         '',
};

// ── Main exports ──────────────────────────────────────────────────────────────

/**
 * generateQuestion
 * Calls the QuestionGenerator service and returns WizardLearn-shaped question objects.
 */
async function generateQuestion({
  subject,
  level,
  topic,
  examType = 'general',
  count = 5,
  userAge,
}) {
  const qgSubject    = SUBJECT_MAP[subject] || 'Maths';
  const qgDifficulty = DIFFICULTY_MAP[level] || 'Medium';
  const qgGrade      = GRADE_MAP[userAge]    || DEFAULT_GRADE;
  const examNote     = EXAM_STYLE_NOTES[examType] || '';

  const payload = {
    subject:       qgSubject,
    difficulty:    qgDifficulty,
    questionTypes: ['multiple_choice'],
    count:         Math.min(count, 20),
    grade:         qgGrade,
    ...(topic    && { topicHint: topic }),
    ...(examNote && { styleNote: examNote }),
  };

  try {
    const data = await callQGService('/api/generate', payload);
    const mapped = mapKhanToWizardLearn(data, subject, level, examType);
    if (mapped.length === 0) throw new Error('QuestionGenerator returned 0 usable questions');
    return mapped;
  } catch (err) {
    console.warn(`⚠️  QuestionGenerator unavailable (${err.message}) — using seed bank`);
    return getFallbackQuestions(subject, level, count);
  }
}

/**
 * generateBulk
 * Calls the QuestionGenerator bulk endpoint.
 * Useful for a nightly cron job that pre-populates the DB.
 */
async function generateBulk({
  subjects       = ['maths', 'english', 'verbal', 'nonverbal'],
  levels         = [1, 2, 3, 4, 5],
  countPerBatch  = 10,
} = {}) {
  const payload = {
    subjects:      subjects.map(s => SUBJECT_MAP[s] || s),
    difficulties:  ['Easy', 'Medium', 'Hard'],
    questionTypes: ['multiple_choice'],
    countPerBatch,
    grade:         DEFAULT_GRADE,
  };

  const data = await callQGService('/api/generate/bulk', payload);

  const all = [];
  for (const subject of subjects) {
    for (const level of levels) {
      const diff = DIFFICULTY_MAP[level];
      const filtered = (data.exercise_bank || []).filter(q =>
        q.subject === SUBJECT_MAP[subject] && q.difficulty === diff
      );
      all.push(...mapKhanToWizardLearn({ exercise_bank: filtered }, subject, level, 'general'));
    }
  }
  return all;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function callQGService(path, body) {
  const url     = `${QG_BASE_URL}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  if (QG_API_KEY) headers['Authorization'] = `Bearer ${QG_API_KEY}`;

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), QG_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method:  'POST',
      headers,
      body:    JSON.stringify(body),
      signal:  controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 120)}`);
    }
    return res.json();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`Timed out after ${QG_TIMEOUT_MS}ms`);
    }
    throw err;
  }
}

/**
 * mapKhanToWizardLearn
 *
 * Khan Academy v1 question shape (from QuestionGenerator):
 * {
 *   id, subject, topic, difficulty, question_type, grade_level,
 *   question: { text, choices: [{id, text, correct}] },
 *   correct_answer, explanation, tags, points
 * }
 *
 * WizardLearn Question schema (models/Question.js):
 * {
 *   subject, level, topic, examType,
 *   questionText, options[], correctIndex,
 *   explanation, hint, xpReward, difficulty, aiGenerated
 * }
 */
function mapKhanToWizardLearn(data, subject, level, examType) {
  const bank = data.exercise_bank || data.questions || [];

  return bank
    .filter(q =>
      q.question_type === 'multiple_choice' &&
      Array.isArray(q.question?.choices) &&
      q.question.choices.length === 4
    )
    .map(q => {
      const choices      = q.question.choices;
      const correctIndex = choices.findIndex(c => c.correct === true);
      const options      = choices.map(c => c.text);

      const diffLower = (q.difficulty || 'medium').toLowerCase();
      const xpMap     = { easy: 10, medium: 15, hard: 25 };
      const xpReward  = xpMap[diffLower] || level * 8;

      const hint = q.hint || deriveHint(q.explanation || '');

      return {
        subject,
        level,
        topic:        normaliseTopic(q.topic || subject),
        examType:     examType || 'general',
        questionText: q.question.text,
        options,
        correctIndex: correctIndex >= 0 ? correctIndex : 0,
        explanation:  q.explanation || '',
        hint,
        xpReward,
        difficulty:   diffLower,
        aiGenerated:  true,
        sourceId:     q.id || null,
      };
    });
}

function deriveHint(explanation) {
  if (!explanation) return 'Think carefully about each option.';
  const first = explanation.split(/[.!?]/)[0].trim();
  return first.length > 80 ? first.slice(0, 77) + '…' : first || 'Think carefully about each option.';
}

function normaliseTopic(topic) {
  return topic.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

// ── Seeded fallback bank ──────────────────────────────────────────────────────
const FALLBACK_BANK = {
  maths: [
    { level:1, questionText:'What is 7 × 8?', options:['48','54','56','64'], correctIndex:2, hint:'Count up in 8s.', explanation:'7×8=56.', topic:'mental arithmetic', xpReward:10, difficulty:'easy' },
    { level:2, questionText:'What is 3/4 of 160?', options:['110','120','130','125'], correctIndex:1, hint:'Divide by 4, multiply by 3.', explanation:'160÷4=40; 40×3=120.', topic:'fractions', xpReward:15, difficulty:'medium' },
    { level:3, questionText:'A train travels 240 km in 3 hours. Average speed?', options:['60 km/h','70 km/h','80 km/h','90 km/h'], correctIndex:2, hint:'Speed = Distance ÷ Time.', explanation:'240÷3=80 km/h.', topic:'word problems', xpReward:20, difficulty:'medium' },
    { level:4, questionText:'If 5x + 3 = 28, what is x?', options:['4','5','6','7'], correctIndex:1, hint:'Subtract 3, then divide by 5.', explanation:'5x=25; x=5.', topic:'algebra', xpReward:25, difficulty:'hard' },
    { level:5, questionText:'What is 15% of 320?', options:['44','46','48','52'], correctIndex:2, hint:'10% is 32, 5% is 16.', explanation:'32+16=48.', topic:'percentages', xpReward:35, difficulty:'hard' },
  ],
  english: [
    { level:1, questionText:'Which word means HAPPY?', options:['Sad','Joyful','Angry','Tired'], correctIndex:1, hint:'A positive emotion.', explanation:'Joyful means very happy.', topic:'vocabulary', xpReward:10, difficulty:'easy' },
    { level:2, questionText:'Choose the word most similar to BENEVOLENT:', options:['Malicious','Generous','Indifferent','Powerful'], correctIndex:1, hint:"'Bene' means good in Latin.", explanation:'Benevolent = kind and generous.', topic:'synonyms', xpReward:15, difficulty:'medium' },
    { level:3, questionText:"Plural of 'phenomenon'?", options:['Phenomenons','Phenomenas','Phenomena','Phenomenes'], correctIndex:2, hint:'Greek origin — special plural.', explanation:'Phenomena is correct.', topic:'grammar', xpReward:20, difficulty:'medium' },
    { level:4, questionText:'Synonym of ELOQUENT:', options:['Clumsy','Articulate','Silent','Confused'], correctIndex:1, hint:'Describes a skilled speaker.', explanation:'Articulate = expressing clearly.', topic:'vocabulary', xpReward:25, difficulty:'hard' },
    { level:5, questionText:'Odd one out: HUGE · ENORMOUS · TINY · GIGANTIC', options:['HUGE','ENORMOUS','TINY','GIGANTIC'], correctIndex:2, hint:'Three share the same meaning.', explanation:'TINY means small; others mean large.', topic:'odd one out', xpReward:30, difficulty:'medium' },
  ],
  verbal: [
    { level:1, questionText:'Dog is to Puppy as Cat is to ___?', options:['Kitten','Cub','Lamb','Calf'], correctIndex:0, hint:'Baby cat.', explanation:'A baby cat is a kitten.', topic:'analogies', xpReward:10, difficulty:'easy' },
    { level:2, questionText:'If BOOK = 2-15-15-11, what does CAT equal?', options:['3-1-20','3-1-19','3-21-20','4-1-20'], correctIndex:0, hint:'A=1, B=2, C=3…', explanation:'C=3,A=1,T=20 → 3-1-20.', topic:'codes', xpReward:15, difficulty:'medium' },
    { level:3, questionText:'If RAIN is coded as SBJO, how is SNOW coded?', options:['TOPX','TNPX','TOPY','UPPY'], correctIndex:0, hint:'Each letter moves +1 in alphabet.', explanation:'S→T,N→O,O→P,W→X = TOPX.', topic:'letter codes', xpReward:20, difficulty:'medium' },
    { level:4, questionText:'Two most similar: SWIFT · RAPID · SLOW · QUICK · HEAVY', options:['SWIFT and SLOW','RAPID and QUICK','QUICK and HEAVY','SWIFT and HEAVY'], correctIndex:1, hint:'Speed synonyms.', explanation:'RAPID and QUICK both mean fast.', topic:'synonyms', xpReward:25, difficulty:'hard' },
    { level:5, questionText:'Odd one out: OAK · PINE · ROSE · BIRCH · ELM', options:['OAK','PINE','ROSE','BIRCH'], correctIndex:2, hint:'Four are trees.', explanation:'ROSE is a flower; others are trees.', topic:'word relationships', xpReward:30, difficulty:'medium' },
  ],
  nonverbal: [
    { level:1, questionText:'4 equal sides + 4 right angles = ?', options:['Rectangle','Rhombus','Square','Parallelogram'], correctIndex:2, hint:'Both equal sides AND right angles.', explanation:'Square has both.', topic:'shapes', xpReward:10, difficulty:'easy' },
    { level:2, questionText:'Sequence: ○ ●○ ●●○ — next?', options:['●●●○','●○●○','○●●','●●●'], correctIndex:0, hint:'One ● added each time.', explanation:'●●●○.', topic:'pattern sequences', xpReward:15, difficulty:'medium' },
    { level:3, questionText:'Arrow points UP, rotated 90° clockwise — new direction?', options:['Left','Right','Down','Up'], correctIndex:1, hint:"12 o'clock to 3 o'clock.", explanation:'UP → RIGHT.', topic:'shape rotation', xpReward:20, difficulty:'medium' },
    { level:4, questionText:'How many squares of ANY size in a 3×3 grid?', options:['9','12','14','16'], correctIndex:2, hint:'Count 1×1, 2×2, 3×3 separately.', explanation:'9+4+1=14.', topic:'spatial reasoning', xpReward:25, difficulty:'hard' },
    { level:5, questionText:'Odd one out: triangle, square, circle, diamond, rectangle?', options:['triangle','square','circle','diamond'], correctIndex:2, hint:'One has no straight sides.', explanation:'Circle is the only non-polygon.', topic:'odd shape out', xpReward:30, difficulty:'medium' },
  ],
};

function getFallbackQuestions(subject, level, count = 5) {
  const bank    = FALLBACK_BANK[subject] || FALLBACK_BANK.maths;
  const byLevel = bank.filter(q => q.level === level);
  const pool    = byLevel.length ? byLevel : bank;
  return [...pool]
    .sort(() => Math.random() - 0.5)
    .slice(0, count)
    .map(q => ({ ...q, subject, aiGenerated: false }));
}

module.exports = { generateQuestion, generateBulk, getFallbackQuestions };
