const mongoose = require("mongoose");

const academicNewTaskSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  user: { type: String, trim: true },
  createdby: { type: String, trim: true },
  academicyear: { type: String, trim: true },
  faculty: { type: String, trim: true },
  facultyemail: { type: String, trim: true, index: true },
  task: { type: String, trim: true },
  category: { type: String, trim: true },
  criticality: { type: String, trim: true, default: "Normal" },
  pagelink: { type: String, trim: true },
  startdate: { type: Date },
  duedate: { type: Date },
  status: { type: String, trim: true, default: "New" },
  comments: { type: String, trim: true },
  referenceModel: { type: String, trim: true, index: true },
  referenceId: { type: String, trim: true, index: true },
  referenceLevel: { type: String, trim: true }
}, { timestamps: true });

module.exports = mongoose.model("academicnewtaskds", academicNewTaskSchema);
