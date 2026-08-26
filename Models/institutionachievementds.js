const mongoose = require("mongoose");

const institutionAchievementSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true },
    namecreated: { type: String, trim: true },
    academicyear: { type: String, trim: true, index: true },
    type: { type: String, trim: true, enum: ["faculty", "student", "Faculty", "Student"], default: "student" },
    name: { type: String, trim: true },
    regno: { type: String, trim: true },
    achievement: { type: String, trim: true },
    achievementtype: { type: String, trim: true },
    category: { type: String, trim: true },
    achievementdate: { type: Date },
    agency: { type: String, trim: true },
    location: { type: String, trim: true },
    status: { type: String, trim: true, default: "Active" }
  },
  { timestamps: true }
);

institutionAchievementSchema.index({ colid: 1, academicyear: 1, type: 1, category: 1 });

module.exports = mongoose.model("institutionachievementds", institutionAchievementSchema);
