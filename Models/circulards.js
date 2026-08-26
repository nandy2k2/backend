const mongoose = require("mongoose");

const circularSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  user: { type: String, trim: true },
  namecreated: { type: String, trim: true },
  academicyear: { type: String, trim: true, index: true },
  circular: { type: String, trim: true, required: true },
  description: { type: String, trim: true },
  startdate: { type: Date, index: true },
  enddate: { type: Date, index: true },
  filelink: { type: String, trim: true },
  roles: [{ type: String, trim: true }],
  targettype: { type: String, trim: true, enum: ["All", "Role", "Student", "Program"], default: "All", index: true },
  regulation: { type: String, trim: true },
  program: { type: String, trim: true },
  programcode: { type: String, trim: true, index: true },
  semester: { type: String, trim: true, index: true },
  active: { type: String, trim: true, default: "Yes" }
}, { timestamps: true });

module.exports = mongoose.models.circulards || mongoose.model("circulards", circularSchema);
