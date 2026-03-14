const mongoose = require('mongoose');

const loginEventSchema = new mongoose.Schema({
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  email:      { type: String },
  // Location (derived from IP via ip-api.com — free, no key needed)
  ip:         { type: String },
  country:    { type: String },
  countryCode:{ type: String },
  region:     { type: String },
  city:       { type: String },
  lat:        { type: Number },
  lon:        { type: Number },
  timezone:   { type: String },
  isp:        { type: String },
  // Device
  userAgent:  { type: String },
  device:     { type: String },   // 'mobile' | 'tablet' | 'desktop'
  browser:    { type: String },
  os:         { type: String },
  // Status
  success:    { type: Boolean, default: true },
}, { timestamps: true });

loginEventSchema.index({ userId: 1, createdAt: -1 });
loginEventSchema.index({ createdAt: -1 });
loginEventSchema.index({ country: 1 });

module.exports = mongoose.model('LoginEvent', loginEventSchema);
