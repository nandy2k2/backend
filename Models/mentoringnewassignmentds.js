const mongoose = require("mongoose");

const mentoringNewAssignmentSchema = new mongoose.Schema(
  {
    module: { type: String, enum: ["Mentoring", "Student Welfare"], required: true, index: true },
    academicyear: { type: String, trim: true, required: true, index: true },
    regulation: { type: String, trim: true, default: "" },
    program: { type: String, trim: true, default: "" },
    programcode: { type: String, trim: true, default: "", index: true },
    semester: { type: String, trim: true, default: "" },
    student: { type: String, trim: true, required: true },
    studentemail: { type: String, trim: true, default: "", lowercase: true },
    regno: { type: String, trim: true, required: true, index: true },
    section: { type: String, trim: true, default: "" },
    officer: { type: String, trim: true, required: true },
    officeremail: { type: String, trim: true, required: true, lowercase: true, index: true },
    transferredfrom: { type: String, trim: true, default: "" },
    transferredfromemail: { type: String, trim: true, default: "", lowercase: true },
    transferremarks: { type: String, trim: true, default: "" },
    status: { type: String, trim: true, default: "Active", index: true },
    assigneddate: { type: Date, default: Date.now },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

mentoringNewAssignmentSchema.index({ colid: 1, module: 1, academicyear: 1, programcode: 1, semester: 1, regno: 1 }, { unique: true });

module.exports = mongoose.models.mentoringnewassignmentds || mongoose.model("mentoringnewassignmentds", mentoringNewAssignmentSchema);
