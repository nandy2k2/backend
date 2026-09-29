const mongoose = require("mongoose");

const OnlineExam2AssignmentSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  examid: { type: mongoose.Schema.Types.ObjectId, ref: "onlineexam2ds", index: true },
  academicyear: { type: String, index: true },
  regulation: String,
  program: String,
  programcode: { type: String, index: true },
  semester: { type: String, index: true },
  section: { type: String, index: true },
  status: { type: String, default: "Active" },
  user: String,
  username: String
}, { timestamps: true });

OnlineExam2AssignmentSchema.index({ colid: 1, examid: 1, programcode: 1, semester: 1, section: 1 });

module.exports = mongoose.models.onlineexam2assignmentds || mongoose.model("onlineexam2assignmentds", OnlineExam2AssignmentSchema);
