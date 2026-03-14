const nodemailer = require('nodemailer');

let transporter;

function getTransporter() {
  if (transporter) return transporter;

  // In development, log OTP to console instead of sending real email
  if (process.env.NODE_ENV === 'development' && !process.env.EMAIL_USER) {
    transporter = {
      sendMail: async (opts) => {
        console.log('\n📧  [DEV EMAIL]');
        console.log('   To:', opts.to);
        console.log('   Subject:', opts.subject);
        const match = opts.html.match(/letter-spacing[^>]*>(\d{6})</);
        if (match) console.log('   OTP CODE:', match[1]);
        console.log('');
        return { messageId: 'dev-' + Date.now() };
      }
    };
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  return transporter;
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function sendOtpEmail(email, otp, userName = 'Wizard') {
  const t = getTransporter();
  const expiryMins = process.env.OTP_EXPIRES_MINUTES || 10;

  await t.sendMail({
    from: process.env.EMAIL_FROM || 'WizardLearn <noreply@wizardlearn.app>',
    to: email,
    subject: `🧙 Your WizardLearn Magic Code: ${otp}`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0f0a1e;font-family:'Segoe UI',sans-serif">
  <div style="max-width:480px;margin:0 auto;padding:40px 20px">
    <div style="text-align:center;margin-bottom:32px">
      <div style="font-size:64px">🧙</div>
      <h1 style="color:#fff;font-size:28px;margin:8px 0">WizardLearn</h1>
      <p style="color:#a78bfa;margin:0">11+ Magic Academy</p>
    </div>
    <div style="background:#1a1035;border:1px solid #3d2a80;border-radius:20px;padding:32px;text-align:center">
      <p style="color:#fff;font-size:16px;margin-bottom:8px">Hi <strong>${userName}</strong>! 👋</p>
      <p style="color:#c4b5fd;font-size:14px;margin-bottom:24px">Here's your magic login code:</p>
      <div style="background:#251848;border:2px solid #7c3aed;border-radius:16px;padding:24px;margin-bottom:24px">
        <div style="font-size:48px;font-weight:900;color:#fbbf24;letter-spacing:12px">${otp}</div>
      </div>
      <p style="color:#7c6aac;font-size:13px">This code expires in <strong style="color:#c4b5fd">${expiryMins} minutes</strong></p>
      <p style="color:#7c6aac;font-size:12px;margin-top:8px">If you didn't request this, you can ignore this email.</p>
    </div>
    <p style="color:#4a3a6a;font-size:12px;text-align:center;margin-top:24px">
      WizardLearn · Helping kids ace 11+ exams ✨
    </p>
  </div>
</body>
</html>`,
  });
}

async function sendWelcomeEmail(email, userName) {
  const t = getTransporter();
  await t.sendMail({
    from: process.env.EMAIL_FROM || 'WizardLearn <noreply@wizardlearn.app>',
    to: email,
    subject: `🏰 Welcome to WizardLearn, ${userName}!`,
    html: `
<body style="background:#0f0a1e;font-family:'Segoe UI',sans-serif;padding:40px 20px;max-width:480px;margin:0 auto">
  <div style="text-align:center">
    <div style="font-size:64px">🎉</div>
    <h1 style="color:#fbbf24">Welcome, ${userName}!</h1>
    <p style="color:#c4b5fd">Your 11+ magic journey starts now. Good luck — we believe in you! 🌟</p>
    <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}" 
       style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:700;margin-top:16px">
      Start Learning →
    </a>
  </div>
</body>`,
  });
}

async function sendWeeklyReport(parentEmail, childName, stats) {
  const t = getTransporter();
  await t.sendMail({
    from: process.env.EMAIL_FROM || 'WizardLearn <noreply@wizardlearn.app>',
    to: parentEmail,
    subject: `📊 ${childName}'s Weekly WizardLearn Report`,
    html: `
<body style="background:#0f0a1e;font-family:'Segoe UI',sans-serif;padding:40px 20px;max-width:480px;margin:0 auto">
  <h2 style="color:#fbbf24">Weekly Progress Report</h2>
  <p style="color:#c4b5fd"><strong>${childName}</strong>'s summary for this week:</p>
  <table style="width:100%;border-collapse:collapse">
    <tr><td style="color:#c4b5fd;padding:8px 0">Questions answered</td><td style="color:#fff;font-weight:700">${stats.questions}</td></tr>
    <tr><td style="color:#c4b5fd;padding:8px 0">Accuracy</td><td style="color:#fff;font-weight:700">${stats.accuracy}%</td></tr>
    <tr><td style="color:#c4b5fd;padding:8px 0">Time spent</td><td style="color:#fff;font-weight:700">${stats.timeHours}h ${stats.timeMins}m</td></tr>
    <tr><td style="color:#c4b5fd;padding:8px 0">XP earned</td><td style="color:#fbbf24;font-weight:700">+${stats.xp} XP</td></tr>
    <tr><td style="color:#c4b5fd;padding:8px 0">Streak</td><td style="color:#f97316;font-weight:700">🔥 ${stats.streak} days</td></tr>
  </table>
</body>`,
  });
}

module.exports = { generateOtp, sendOtpEmail, sendWelcomeEmail, sendWeeklyReport };
