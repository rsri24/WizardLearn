userSchema.index({ email: 1 });
userSchema.index({ xp: -1 }); // for leaderboard
```

Click **Commit changes**.

---

### Wait 30 seconds then test
```
https://wizard-learn.vercel.app/api/health
