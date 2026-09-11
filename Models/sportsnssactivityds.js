const mongoose = require("mongoose");

const sportsNssActivitySchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  activity: { type: String, required: true },
  activitytype: { type: String, enum: ["Sports", "NCC", "NSS"], required: true },
  description: { type: String },
  status: { type: String, default: "Active" },
  user: { type: String },
  namecreated: { type: String }
}, { timestamps: true });

sportsNssActivitySchema.index({ colid: 1, activitytype: 1, activity: 1 }, { unique: true });

module.exports = mongoose.model("sportsnssactivityds", sportsNssActivitySchema);
