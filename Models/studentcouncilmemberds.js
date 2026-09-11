const mongoose = require("mongoose");

const studentCouncilMemberSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  user: { type: String, trim: true },
  namecreated: { type: String, trim: true },
  academicyear: { type: String, trim: true, required: true, index: true },
  councilid: { type: mongoose.Schema.Types.ObjectId, ref: "studentcouncilds", required: true, index: true },
  councilname: { type: String, trim: true },
  student: { type: String, trim: true },
  studentemail: { type: String, trim: true },
  regno: { type: String, trim: true, required: true, index: true },
  regulation: { type: String, trim: true },
  program: { type: String, trim: true },
  programcode: { type: String, trim: true },
  semester: { type: String, trim: true },
  section: { type: String, trim: true },
  position: { type: String, trim: true, default: "Member" },
  startdate: { type: Date },
  enddate: { type: Date },
  status: { type: String, trim: true, default: "Active" }
}, { timestamps: true });

studentCouncilMemberSchema.index({ colid: 1, councilid: 1, regno: 1 }, { unique: true });

module.exports = mongoose.models.studentcouncilmemberds || mongoose.model("studentcouncilmemberds", studentCouncilMemberSchema);
