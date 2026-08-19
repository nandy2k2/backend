const mongoose = require("mongoose");

const conductExamModeratorPanelMemberSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  panelid: { type: mongoose.Schema.Types.ObjectId, ref: "conductexammoderatorpanelds", required: true, index: true },
  academicyear: { type: String, required: true, trim: true },
  regulation: { type: String, required: true, trim: true },
  program: { type: String, required: true, trim: true },
  programcode: { type: String, required: true, trim: true },
  panelname: { type: String, required: true, trim: true },
  membername: { type: String, required: true, trim: true },
  memberemail: { type: String, required: true, trim: true, lowercase: true },
  role: { type: String, trim: true },
  department: { type: String, trim: true },
  designation: { type: String, trim: true },
  institution: { type: String, trim: true },
  approvalstatus: { type: String, trim: true, default: "Pending" },
  comments: { type: String, trim: true },
  approvedby: { type: String, trim: true },
  approvedbyemail: { type: String, trim: true },
  approveddate: { type: Date },
  status: { type: String, trim: true, default: "Active" },
  name: { type: String, trim: true },
  user: { type: String, trim: true }
}, { timestamps: true });

conductExamModeratorPanelMemberSchema.index({
  colid: 1,
  panelid: 1,
  memberemail: 1
}, { unique: true });

module.exports = mongoose.model("conductexammoderatorpanelmemberds", conductExamModeratorPanelMemberSchema);
