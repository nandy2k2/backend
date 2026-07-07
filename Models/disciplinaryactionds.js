const mongoose = require("mongoose");

const disciplinaryActionSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  academicyear: { type: String, default: "" },
  regulation: { type: String, default: "" },
  program: { type: String, default: "" },
  programcode: { type: String, default: "" },
  semester: { type: String, default: "" },
  section: { type: String, default: "" },
  student: { type: String, required: true },
  regno: { type: String, required: true, index: true },
  email: { type: String, default: "" },
  phone: { type: String, default: "" },
  actiondate: { type: Date, required: true },
  severity: { type: String, default: "Low" },
  description: { type: String, default: "" },
  actiontaken: { type: String, default: "" },
  actiontakendate: { type: Date },
  status: { type: String, default: "Open" },
  user: { type: String, default: "" }
}, { timestamps: true });

disciplinaryActionSchema.index({ colid: 1, regno: 1, status: 1 });
disciplinaryActionSchema.index({ colid: 1, actiondate: 1 });

module.exports = mongoose.model("disciplinaryactionds", disciplinaryActionSchema);
