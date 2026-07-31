const mongoose = require("mongoose");

const trainingPlacementCourseSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    academicyear: { type: String, trim: true },
    coursecode: { type: String, trim: true, required: true },
    coursename: { type: String, trim: true, required: true },
    category: { type: String, trim: true },
    level: { type: String, trim: true },
    duration: { type: String, trim: true },
    mode: { type: String, enum: ["Offline", "Online", "Hybrid"], default: "Offline" },
    description: { type: String, trim: true },
    objectives: { type: String, trim: true },
    skillscovered: { type: String, trim: true },
    startdate: { type: String, trim: true },
    enddate: { type: String, trim: true },
    status: { type: String, trim: true, default: "Active" },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

trainingPlacementCourseSchema.index({ colid: 1, coursecode: 1 }, { unique: true });

module.exports = mongoose.models.trainingplacementcourseds || mongoose.model("trainingplacementcourseds", trainingPlacementCourseSchema);
