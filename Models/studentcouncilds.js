const mongoose = require("mongoose");

const studentCouncilSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  user: { type: String, trim: true },
  namecreated: { type: String, trim: true },
  academicyear: { type: String, trim: true, required: true, index: true },
  councilname: { type: String, trim: true, required: true },
  startdate: { type: Date },
  enddate: { type: Date },
  status: { type: String, trim: true, default: "Active" }
}, { timestamps: true });

studentCouncilSchema.index({ colid: 1, academicyear: 1, councilname: 1 }, { unique: true });

module.exports = mongoose.models.studentcouncilds || mongoose.model("studentcouncilds", studentCouncilSchema);
