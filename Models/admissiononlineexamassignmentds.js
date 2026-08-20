const mongoose = require("mongoose");

const AdmissionOnlineExamAssignmentSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  examid: { type: mongoose.Schema.Types.ObjectId, ref: "onlineexamds", index: true },
  examname: String,
  examcode: String,
  academicyear: String,
  category: String,
  program: String,
  programcode: String,
  applicationid: { type: String, index: true },
  applicationnumber: String,
  applicantname: String,
  applicantemail: String,
  username: String,
  status: { type: String, default: "Assigned" },
  assignedby: String,
  assignedbyname: String,
  remarks: String
}, { timestamps: true });

AdmissionOnlineExamAssignmentSchema.index({ colid: 1, examid: 1, applicationid: 1 }, { unique: true });

module.exports = mongoose.models.admissiononlineexamassignmentds
  || mongoose.model("admissiononlineexamassignmentds", AdmissionOnlineExamAssignmentSchema);
