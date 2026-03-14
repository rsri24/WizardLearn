# 🧙 WizardLearn — Full Stack Setup Guide

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        BROWSER / APP                        │
│                     (public/index.html)                     │
└───────────────────────────┬─────────────────────────────────┘
                            │  HTTP / JWT
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              WizardLearn Backend  (port 3000)               │
│   Express · MongoDB · JWT Auth · Progress · Leaderboard     │
│                                                             │
│   /api/auth/*        — signup, OTP, login                   │
│   /api/questions/*   — fetch, answer, hint                  │
│   /api/progress/*    — analytics, leaderboard               │
│   /api/admin/*       — bulk generate, health check          │
└───────────────────────────┬─────────────────────────────────┘
                            │  POST /api/generate
                            ▼
┌─────────────────────────────────────────────────────────────┐
│          QuestionGenerator Service  (port 3001)             │
│   github.com/rsri24/QuestionGenerator · server.js           │
│                                                             │
│   POST /api/generate       — single batch                   │
│   POST /api/generate/bulk  — all subjects + levels          │
└───────────────────────────┬─────────────────────────────────┘
                            │  Anthropic SDK
                            ▼
                    ┌───────────────┐
                    │  Claude AI    │
                    │ (Anthropic)   │
                    └───────────────┘
```

---

## Quick Start (Local Dev)

### 1. Start the QuestionGenerator service

```bash
git clone https://github.com/rsri24/QuestionGenerator.git
cd QuestionGenerator
npm install express cors dotenv @anthropic-ai/sdk
cp .env.example .env
# Add your ANTHROPIC_API_KEY to .env
node server.js
# ✅ Running on http://localhost:3001
```

### 2. Start WizardLearn backend

```bash
cd wizardlearn-backend
npm install
cp .env.example .env
# Fill in: MONGODB_URI, JWT_SECRET, EMAIL_USER, EMAIL_PASS
# QUESTION_GENERATOR_URL is already http://localhost:3001
npm run seed        # Load starter questions into MongoDB
npm run dev         # ✅ Running on http://localhost:3000
```

### 3. Pre-populate question bank (optional but recommended)

```bash
curl -X POST http://localhost:3000/api/admin/bulk-generate \
  -H "x-admin-secret: YOUR_ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"subjects":["maths","english","verbal","nonverbal"],"levels":[1,2,3,4,5],"countPerBatch":20}'
```

This streams output live — you'll see each subject/level being generated.

### 4. Check QuestionGenerator health

```bash
curl -X POST http://localhost:3000/api/admin/qg-health \
  -H "x-admin-secret: YOUR_ADMIN_SECRET"
```

---

## Deploying to Vercel (Production)

Both services deploy independently to Vercel.

### Deploy QuestionGenerator

```bash
cd QuestionGenerator
vercel --prod
# Note the URL, e.g. https://question-generator-xyz.vercel.app
```

### Deploy WizardLearn

```bash
cd wizardlearn-backend
vercel --prod
```

In Vercel dashboard → WizardLearn project → Settings → Environment Variables, add:

| Variable | Value |
|---|---|
| `MONGODB_URI` | Your Atlas connection string |
| `JWT_SECRET` | Long random string |
| `EMAIL_USER` | Gmail address |
| `EMAIL_PASS` | Gmail app password |
| `EMAIL_FROM` | WizardLearn `<your@gmail.com>` |
| `QUESTION_GENERATOR_URL` | `https://question-generator-xyz.vercel.app` |
| `ADMIN_SECRET` | Secret token for admin routes |
| `FRONTEND_URL` | `https://your-wizardlearn.vercel.app` |
| `NODE_ENV` | `production` |

---

## How Question Generation Works

```
Kid clicks "🤖 New Question" or starts a practice session
         │
         ▼
GET /api/questions?subject=maths&level=3
         │
         ▼
WizardLearn checks MongoDB first
   ├─ Enough unseen questions? → Return them immediately
   └─ Not enough? →
         │
         ▼
POST http://localhost:3001/api/generate
{
  "subject": "Maths",           ← mapped from 'maths'
  "difficulty": "Medium",       ← mapped from level 3
  "questionTypes": ["multiple_choice"],
  "count": 5,
  "grade": "Grade 5-6 (Ages 10-12)",
  "topicHint": "fractions",     ← from chapter context
  "styleNote": "Kent Test GL Assessment — code breaking..."  ← if exam mode
}
         │
         ▼
QuestionGenerator calls Claude AI
Returns Khan Academy v1 JSON
         │
         ▼
WizardLearn adapter maps to internal schema:
  question.text         → questionText
  choices[].text        → options[]
  choices[].correct     → correctIndex
  explanation           → explanation + auto-derived hint
  difficulty + level    → xpReward
         │
         ▼
Saved to MongoDB Question collection
Returned to kid — teacher never sees correct answers until answered
```

---

## Environment Variables Reference

```bash
# Server
NODE_ENV=production
PORT=3000

# MongoDB
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/wizardlearn

# Auth
JWT_SECRET=at_least_32_random_chars_here
JWT_EXPIRES_IN=7d

# Email (OTP + reports)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your@gmail.com
EMAIL_PASS=your_gmail_app_password
EMAIL_FROM=WizardLearn <your@gmail.com>
OTP_EXPIRES_MINUTES=10

# ⭐ QuestionGenerator integration
QUESTION_GENERATOR_URL=https://your-qg-deployment.vercel.app
QUESTION_GENERATOR_KEY=          # optional if you add bearer auth to QG
QG_TIMEOUT_MS=15000

# Admin
ADMIN_SECRET=your_secret_admin_token

# CORS
FRONTEND_URL=https://your-app.vercel.app
```

---

## API Reference

### Auth
| Method | Endpoint | Body | Returns |
|---|---|---|---|
| POST | `/api/auth/signup` | `{email, role, age, schoolYear, targetExam, displayName, avatar, avatarName}` | `{success, isNew}` |
| POST | `/api/auth/request-otp` | `{email}` | `{success}` |
| POST | `/api/auth/verify-otp` | `{email, otp}` | `{success, token, user}` |
| GET | `/api/auth/me` | — | `{success, user}` |
| PATCH | `/api/auth/profile` | `{displayName, settings, ...}` | `{success, user}` |

### Questions
| Method | Endpoint | Params/Body | Returns |
|---|---|---|---|
| GET | `/api/questions` | `?subject=maths&level=3&count=5&examType=kent` | `{questions[], sessionId}` |
| GET | `/api/questions/:id/hint` | — | `{hint}` |
| POST | `/api/questions/:id/answer` | `{chosenIndex, sessionId, timeSpent, hintUsed}` | `{isCorrect, correctIndex, explanation, xpEarned, newBadges[]}` |
| POST | `/api/questions/generate` | `{subject, level, topic, examType}` | `{question}` |

### Progress
| Method | Endpoint | Returns |
|---|---|---|
| GET | `/api/progress/me` | Full analytics (weekly, subjects, weak topics) |
| GET | `/api/progress/leaderboard?scope=class&period=week` | Ranked list |
| GET | `/api/progress/child/:id` | Parent view of child |

### Admin (x-admin-secret header required)
| Method | Endpoint | Returns |
|---|---|---|
| POST | `/api/admin/bulk-generate` | Streamed text log |
| GET | `/api/admin/stats` | DB question/user counts |
| POST | `/api/admin/qg-health` | QuestionGenerator connectivity check |
