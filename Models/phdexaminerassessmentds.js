const mongoose = require("mongoose");

const phdExaminerAssessmentSchema = new mongoose.Schema(
  {
    colid: { type: Number, required: true, index: true },
    assignmentreviewid: { type: String, trim: true, required: true, index: true },
    submissionid: { type: String, trim: true, required: true, index: true },
    rubricid: { type: String, trim: true, default: "" },
    academicyear: { type: String, trim: true, required: true },
    regulation: { type: String, trim: true, default: "" },
    program: { type: String, trim: true, required: true },
    programcode: { type: String, trim: true, required: true },
    student: { type: String, trim: true, required: true },
    regno: { type: String, trim: true, required: true },
    examinername: { type: String, trim: true, default: "" },
    examineremail: { type: String, trim: true, default: "" },
    group: { type: String, trim: true, required: true },
    topic: { type: String, trim: true, required: true },
    value: { type: String, trim: true, enum: ["Yes", "No", ""], default: "" },
    comments: { type: String, trim: true, default: "" },
    submitteddate: { type: Date, default: Date.now },
    name: { type: String, trim: true, default: "" },
    user: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

phdExaminerAssessmentSchema.index({ colid: 1, assignmentreviewid: 1, rubricid: 1 }, { unique: true });

module.exports = mongoose.models.phdexaminerassessmentds || mongoose.model("phdexaminerassessmentds", phdExaminerAssessmentSchema);
