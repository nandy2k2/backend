const mongoose = require("mongoose");

const mentoringSessionSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    academicyear: { type: String, trim: true },
    faculty: { type: String, trim: true },
    facultyemail: { type: String, trim: true },
    student: { type: String, trim: true },
    regno: { type: String, trim: true, index: true },
    activity: { type: String, trim: true },
    activitydate: { type: String, trim: true },
    description: { type: String, trim: true },
    user: { type: String, trim: true },
    status: { type: String, default: "Active", trim: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model("mentoringsessionds", mentoringSessionSchema);
