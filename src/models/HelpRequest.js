const mongoose = require('mongoose');

const helpRequestSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  questionId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Question' },
  subject:     { type: String },
  level:       { type: Number },
  topic:       { type: String },
  questionText:{ type: String },
  // What was delivered
  hintText:    { type: String },
  explanation: { type: String },
  stepByStep:  { type: [String] }, // array of steps for worked solution
  relatedTopics: { type: [String] },
  // AI-generated full explanation
  aiExplanation: { type: String },
  // Did it help?
  helpful:     { type: Boolean }, // thumb up/down from kid
}, { timestamps: true });

helpRequestSchema.index({ userId: 1, createdAt: -1 });
helpRequestSchema.index({ subject: 1, topic: 1 });

module.exports = mongoose.model('HelpRequest', helpRequestSchema);
