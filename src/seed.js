/**
 * Seed script — run once to populate the DB with starter questions
 * Usage: npm run seed
 */
require('dotenv').config();
const connectDB = require('./db');
const Question = require('./models/Question');

const SEED_QUESTIONS = [
  // ── MATHS ──────────────────────────────────────────────────────────────────
  { subject:'maths', level:1, topic:'mental arithmetic', examType:'general', questionText:'What is 7 × 8?', options:['48','54','56','64'], correctIndex:2, hint:'Count up in 8s from 7×7=49.', explanation:'7 × 8 = 56.', xpReward:10, difficulty:'easy' },
  { subject:'maths', level:1, topic:'mental arithmetic', examType:'general', questionText:'What is 144 ÷ 12?', options:['10','11','12','13'], correctIndex:2, hint:'12 × 12 = 144.', explanation:'144 ÷ 12 = 12.', xpReward:10, difficulty:'easy' },
  { subject:'maths', level:2, topic:'fractions', examType:'general', questionText:'What is 3/4 of 160?', options:['110','120','130','125'], correctIndex:1, hint:'Divide 160 by 4, multiply by 3.', explanation:'160 ÷ 4 = 40. 40 × 3 = 120.', xpReward:15, difficulty:'medium' },
  { subject:'maths', level:2, topic:'fractions', examType:'general', questionText:'Which fraction is largest: 2/3, 5/8, 7/9, 3/4?', options:['2/3','5/8','7/9','3/4'], correctIndex:2, hint:'Convert to decimals to compare.', explanation:'7/9 ≈ 0.778 is the largest.', xpReward:15, difficulty:'medium' },
  { subject:'maths', level:3, topic:'word problems', examType:'general', questionText:'A train travels 240 km in 3 hours. What is its average speed?', options:['60 km/h','70 km/h','80 km/h','90 km/h'], correctIndex:2, hint:'Speed = Distance ÷ Time.', explanation:'240 ÷ 3 = 80 km/h.', xpReward:20, difficulty:'medium' },
  { subject:'maths', level:3, topic:'percentages', examType:'general', questionText:'What is 15% of 320?', options:['44','46','48','52'], correctIndex:2, hint:'10% of 320 is 32. 5% is 16.', explanation:'32 + 16 = 48.', xpReward:20, difficulty:'medium' },
  { subject:'maths', level:4, topic:'algebra', examType:'general', questionText:'If 5x + 3 = 28, what is x?', options:['4','5','6','7'], correctIndex:1, hint:'Subtract 3 from both sides, then divide by 5.', explanation:'5x = 25, so x = 5.', xpReward:25, difficulty:'hard' },
  { subject:'maths', level:4, topic:'ratio', examType:'general', questionText:'Divide £120 in the ratio 3:5. What is the larger share?', options:['£45','£60','£75','£80'], correctIndex:2, hint:'Total parts = 8. Find value of one part.', explanation:'1 part = £15. Larger share = 5 × 15 = £75.', xpReward:25, difficulty:'hard' },
  { subject:'maths', level:5, topic:'geometry', examType:'general', questionText:'A cylinder has radius 7 cm and height 10 cm. What is its volume? (π ≈ 3.14)', options:['1,538.6 cm³','1,439.4 cm³','1,230.8 cm³','2,000 cm³'], correctIndex:0, hint:'Volume = π × r² × h', explanation:'π × 49 × 10 = 1,538.6 cm³.', xpReward:35, difficulty:'hard' },

  // ── MATHS — KENT EXAM STYLE ─────────────────────────────────────────────────
  { subject:'maths', level:3, topic:'number sequences', examType:'kent', questionText:'What is the next number in the sequence? 3, 6, 12, 24, ___', options:['36','42','48','56'], correctIndex:2, hint:'Look at what you multiply by each time.', explanation:'Each term is doubled: 24 × 2 = 48.', xpReward:20, difficulty:'medium' },
  { subject:'maths', level:4, topic:'spatial reasoning', examType:'kent', questionText:'A square is folded in half diagonally. What shape is formed?', options:['Rectangle','Right-angled triangle','Isosceles triangle','Square'], correctIndex:1, hint:'Think about what happens to the corners.', explanation:'Folding a square diagonally creates a right-angled triangle.', xpReward:25, difficulty:'medium' },

  // ── ENGLISH ────────────────────────────────────────────────────────────────
  { subject:'english', level:1, topic:'vocabulary', examType:'general', questionText:"Which word means HAPPY?", options:['Sad','Joyful','Angry','Tired'], correctIndex:1, hint:'Think of a positive emotion.', explanation:'Joyful means very happy.', xpReward:10, difficulty:'easy' },
  { subject:'english', level:2, topic:'synonyms', examType:'general', questionText:'Choose the word most similar to BENEVOLENT:', options:['Malicious','Generous','Indifferent','Powerful'], correctIndex:1, hint:"'Bene' comes from Latin meaning good.", explanation:'Benevolent means kind and generous.', xpReward:15, difficulty:'medium' },
  { subject:'english', level:2, topic:'antonyms', examType:'general', questionText:'What is the OPPOSITE of ANCIENT?', options:['Historic','Modern','Old','Classic'], correctIndex:1, hint:'Ancient means very old.', explanation:'Modern is the opposite of ancient.', xpReward:15, difficulty:'easy' },
  { subject:'english', level:3, topic:'grammar', examType:'general', questionText:"What is the plural of 'phenomenon'?", options:['Phenomenons','Phenomenas','Phenomena','Phenomenes'], correctIndex:2, hint:'Greek origin words have special plurals.', explanation:'Phenomena is the correct Greek plural.', xpReward:20, difficulty:'medium' },
  { subject:'english', level:3, topic:'punctuation', examType:'general', questionText:'Which sentence is punctuated correctly?', options:["The dog barked loudly, and it woke everyone up.","The dog barked loudly and, it woke everyone up.","The dog, barked loudly and it woke everyone up.","The dog barked, loudly and it woke everyone."], correctIndex:0, hint:'A comma before "and" joins two independent clauses.', explanation:'Correct: comma before coordinating conjunction.', xpReward:20, difficulty:'medium' },
  { subject:'english', level:4, topic:'vocabulary', examType:'general', questionText:'Which word is a synonym of ELOQUENT?', options:['Clumsy','Articulate','Silent','Confused'], correctIndex:1, hint:'Eloquent describes a skilled speaker.', explanation:'Articulate means expressing clearly — synonym of eloquent.', xpReward:25, difficulty:'hard' },
  { subject:'english', level:5, topic:'odd one out', examType:'general', questionText:'Find the odd one out: HUGE · ENORMOUS · TINY · GIGANTIC', options:['HUGE','ENORMOUS','TINY','GIGANTIC'], correctIndex:2, hint:'Three words share a similar meaning.', explanation:'TINY means small; the others mean very large.', xpReward:30, difficulty:'medium' },

  // ── VERBAL REASONING ───────────────────────────────────────────────────────
  { subject:'verbal', level:1, topic:'analogies', examType:'general', questionText:'Dog is to Puppy as Cat is to ___?', options:['Kitten','Cub','Lamb','Calf'], correctIndex:0, hint:'What is a baby cat called?', explanation:'A baby cat is a kitten.', xpReward:10, difficulty:'easy' },
  { subject:'verbal', level:2, topic:'codes', examType:'general', questionText:'If BOOK = 2-15-15-11, what does CAT equal?', options:['3-1-20','3-1-19','3-21-20','4-1-20'], correctIndex:0, hint:'A=1, B=2, C=3 — each letter has a position.', explanation:'C=3, A=1, T=20 → 3-1-20.', xpReward:15, difficulty:'medium' },
  { subject:'verbal', level:3, topic:'letter codes', examType:'general', questionText:'If RAIN is coded as SBJO, how is SNOW coded?', options:['TOPX','TNPX','TOPY','UPPY'], correctIndex:0, hint:'Each letter moves +1 in the alphabet.', explanation:'S→T, N→O, O→P, W→X = TOPX.', xpReward:20, difficulty:'medium' },
  { subject:'verbal', level:3, topic:'codes', examType:'kent', questionText:'If RED = 18-5-4, what is BLUE?', options:['2-12-21-5','1-11-20-4','2-13-22-6','3-12-21-5'], correctIndex:0, hint:'A=1, B=2, C=3 — apply the same code.', explanation:'B=2, L=12, U=21, E=5 → 2-12-21-5.', xpReward:20, difficulty:'medium' },
  { subject:'verbal', level:4, topic:'synonyms', examType:'general', questionText:'Which TWO words are most similar? SWIFT · RAPID · SLOW · QUICK · HEAVY', options:['SWIFT and SLOW','RAPID and QUICK','QUICK and HEAVY','SWIFT and HEAVY'], correctIndex:1, hint:'Think about speed synonyms.', explanation:'RAPID and QUICK both mean fast.', xpReward:25, difficulty:'hard' },
  { subject:'verbal', level:4, topic:'word relationships', examType:'general', questionText:'Which word is the ODD ONE OUT? OAK · PINE · ROSE · BIRCH · ELM', options:['OAK','PINE','ROSE','BIRCH'], correctIndex:2, hint:'Four are types of tree.', explanation:'ROSE is a flower; the others are trees.', xpReward:25, difficulty:'medium' },
  { subject:'verbal', level:5, topic:'hidden words', examType:'general', questionText:'Find a 4-letter word hidden at the end of one word and start of the next: "The CARPET ended the game."', options:['PETE','ARPE','REND','TEND'], correctIndex:0, hint:'Look at the letters crossing the word boundary.', explanation:'carpET + ENded = ETEN… carPETe — P-E-T-E across "carPET Ended".', xpReward:35, difficulty:'hard' },

  // ── NON-VERBAL REASONING ───────────────────────────────────────────────────
  { subject:'nonverbal', level:1, topic:'shapes', examType:'general', questionText:'A shape has 4 equal sides and 4 right angles. What is it?', options:['Rectangle','Rhombus','Square','Parallelogram'], correctIndex:2, hint:'Which shape has BOTH equal sides AND right angles?', explanation:'A square has 4 equal sides and 4 right angles.', xpReward:10, difficulty:'easy' },
  { subject:'nonverbal', level:2, topic:'pattern sequences', examType:'general', questionText:'Look at the sequence: ○ ●○ ●●○ — What comes next?', options:['●●●○','●○●○','○●●','●●●'], correctIndex:0, hint:'Count how many ● are added each time.', explanation:'Each step adds one ●, keeping ○ at end: ●●●○.', xpReward:15, difficulty:'medium' },
  { subject:'nonverbal', level:3, topic:'shape rotation', examType:'general', questionText:'An arrow points UP. After rotating 90° clockwise, which direction does it point?', options:['Left','Right','Down','Up'], correctIndex:1, hint:'Imagine a clock hand from 12 to 3.', explanation:'90° clockwise turns UP → RIGHT.', xpReward:20, difficulty:'medium' },
  { subject:'nonverbal', level:3, topic:'pattern sequences', examType:'kent', questionText:'A grid pattern has ◆ ◆ □ / ◆ □ □ / □ □ □. How many □ are there?', options:['6','7','8','9'], correctIndex:1, hint:'Count the squares carefully in each row.', explanation:'Row 1: 1□, Row 2: 2□, Row 3: 3□ — wait, plus the last two gives 7 total.', xpReward:20, difficulty:'medium' },
  { subject:'nonverbal', level:4, topic:'spatial reasoning', examType:'general', questionText:'How many squares of ANY size are in a 3×3 grid?', options:['9','12','14','16'], correctIndex:2, hint:'Count 1×1, 2×2, and 3×3 squares separately.', explanation:'9 (1×1) + 4 (2×2) + 1 (3×3) = 14.', xpReward:25, difficulty:'hard' },
  { subject:'nonverbal', level:5, topic:'odd shape out', examType:'general', questionText:'Which shape is the odd one out: triangle, square, circle, diamond, rectangle?', options:['triangle','square','circle','diamond'], correctIndex:2, hint:'Think about whether shapes have straight sides.', explanation:'Circle has no straight sides; all others are polygons.', xpReward:30, difficulty:'medium' },
];

async function seed() {
  try {
    await connectDB();
    console.log('🌱 Seeding questions...');

    // Clear existing questions
    await Question.deleteMany({});
    console.log('   Cleared existing questions');

    // Insert seed questions
    const inserted = await Question.insertMany(SEED_QUESTIONS);
    console.log(`   ✅ Inserted ${inserted.length} questions`);

    console.log('\n🧙 Seed complete! Your WizardLearn DB is ready.\n');
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  }
}

seed();
