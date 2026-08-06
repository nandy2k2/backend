const mongoose = require("mongoose");

const mentoringCulturalActivitySchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  academicyear: { type: String, trim: true, index: true },
  program: { type: String, trim: true },
  programcode: { type: String, trim: true, index: true },
  student: { type: String, trim: true },
  regno: { type: String, trim: true, index: true },
  activitytype: { type: String, trim: true },
  activitydate: { type: String, trim: true, index: true },
  activityname: { type: String, trim: true },
  venue: { type: String, trim: true },
  location: { type: String, trim: true },
  prizewon: { type: String, trim: true, default: "NA" },
  source: { type: String, trim: true, default: "Admin" },
  status: { type: String, trim: true, default: "Active" },
  user: { type: String, trim: true }
}, { timestamps: true });

mentoringCulturalActivitySchema.index({ colid: 1, regno: 1, activitydate: -1 });

module.exports = mongoose.models.mentoringculturalactivityds
  || mongoose.model("mentoringculturalactivityds", mentoringCulturalActivitySchema);
