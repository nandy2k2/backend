const mongoose = require("mongoose");

const studentCouncilMeetingSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  user: { type: String, trim: true },
  namecreated: { type: String, trim: true },
  academicyear: { type: String, trim: true, required: true, index: true },
  councilid: { type: mongoose.Schema.Types.ObjectId, ref: "studentcouncilds", required: true, index: true },
  councilname: { type: String, trim: true },
  meeting: { type: String, trim: true, required: true },
  meetingdate: { type: Date },
  agenda: { type: String, trim: true },
  discussion: { type: String, trim: true },
  actionitems: { type: String, trim: true },
  issues: { type: String, trim: true },
  filelink: { type: String, trim: true },
  filename: { type: String, trim: true },
  status: { type: String, trim: true, default: "Active" }
}, { timestamps: true });

module.exports = mongoose.models.studentcouncilmeetingds || mongoose.model("studentcouncilmeetingds", studentCouncilMeetingSchema);
