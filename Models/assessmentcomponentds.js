const mongoose = require("mongoose");

const courseAssessmentSchema = new mongoose.Schema(
  {
    academicyear: { type: String, trim: true, required: true },
    regulation: { type: String, trim: true, required: true },
    program: { type: String, trim: true, required: true },
    programcode: { type: String, trim: true, required: true },
    type: { type: String, enum: ["Major", "Minor"], required: true },
    subject: { type: String, trim: true },
    semester: { type: String, trim: true },
    course: { type: String, trim: true, required: true },
    coursecode: { type: String, trim: true, required: true },
    assessmentgroup: { type: String, trim: true },
    grouptype: { type: String, enum: ["Best", "Average"], trim: true },
    scoretype: { type: String, enum: ["Internal", "External"], trim: true },
    componenttype: { type: String, enum: ["Theory", "Practical", "Viva"], trim: true },
    assessmentcomponent: { type: String, trim: true, required: true },
    marks: { type: Number, default: 0 },
    passmarks: { type: Number, default: 0 },
    weightage: { type: Number, default: 0 },
    credits: { type: Number, default: 0 },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true },
    status: { type: String, trim: true, default: "Active" }
  },
  { timestamps: true }
);

courseAssessmentSchema.index({
  colid: 1,
  academicyear: 1,
  regulation: 1,
  programcode: 1,
  type: 1,
  coursecode: 1,
  assessmentgroup: 1,
  grouptype: 1,
  scoretype: 1,
  componenttype: 1,
  assessmentcomponent: 1
});

module.exports = mongoose.model("assessmentcomponentds", courseAssessmentSchema);
