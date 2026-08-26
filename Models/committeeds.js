const mongoose = require("mongoose");

const committeeMemberSchema = new mongoose.Schema({
  name: { type: String, trim: true },
  email: { type: String, trim: true },
  role: { type: String, trim: true },
  department: { type: String, trim: true },
  designation: { type: String, trim: true }
}, { _id: false });

const committeeSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  user: { type: String, trim: true },
  namecreated: { type: String, trim: true },
  committeename: { type: String, trim: true, required: true },
  members: [committeeMemberSchema],
  type: { type: String, trim: true, enum: ["Academic", "Administrative", "Statutory"], default: "Academic" },
  level: { type: String, trim: true, enum: ["Departmental", "School", "Institute", "University"], default: "Departmental" },
  startdate: { type: Date },
  active: { type: String, trim: true, default: "Yes" }
}, { timestamps: true });

module.exports = mongoose.models.committeeds || mongoose.model("committeeds", committeeSchema);
