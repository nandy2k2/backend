const mongoose = require("mongoose");

const mentoringNewInteractionSchema = new mongoose.Schema(
  {
    module: { type: String, enum: ["Mentoring", "Student Welfare"], required: true, index: true },
    assignmentid: { type: mongoose.Schema.Types.ObjectId, ref: "mentoringnewassignmentds", index: true },
    academicyear: { type: String, trim: true, required: true, index: true },
    regulation: { type: String, trim: true, default: "" },
    program: { type: String, trim: true, default: "" },
    programcode: { type: String, trim: true, default: "", index: true },
    semester: { type: String, trim: true, default: "" },
    student: { type: String, trim: true, required: true },
    studentemail: { type: String, trim: true, default: "", lowercase: true },
    regno: { type: String, trim: true, required: true, index: true },
    officer: { type: String, trim: true, required: true },
    officeremail: { type: String, trim: true, required: true, lowercase: true, index: true },
    interactiondate: { type: String, trim: true, required: true },
    interactiontype: { type: String, trim: true, default: "Counselling" },
    interaction: { type: String, trim: true, default: "" },
    actiontaken: { type: String, trim: true, default: "" },
    followupdate: { type: String, trim: true, default: "" },
    remarks: { type: String, trim: true, default: "" },
    status: { type: String, trim: true, default: "Active", index: true },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

module.exports = mongoose.models.mentoringnewinteractionds || mongoose.model("mentoringnewinteractionds", mentoringNewInteractionSchema);
