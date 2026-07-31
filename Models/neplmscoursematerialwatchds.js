const mongoose = require("mongoose");

const neplmsCourseMaterialWatchSchema = new mongoose.Schema({
  materialid: { type: mongoose.Schema.Types.ObjectId, ref: "neplmsresourceds", index: true },
  academicyear: { type: String, trim: true },
  regulation: { type: String, trim: true },
  program: { type: String, trim: true },
  programcode: { type: String, trim: true },
  semester: { type: String, trim: true },
  course: { type: String, trim: true },
  coursecode: { type: String, trim: true },
  title: { type: String, trim: true },
  student: { type: String, trim: true },
  studentemail: { type: String, trim: true },
  regno: { type: String, trim: true },
  watchedseconds: { type: Number, default: 0 },
  durationseconds: { type: Number, default: 0 },
  watchedpercent: { type: Number, default: 0 },
  lastwatchedat: { type: Date },
  colid: { type: Number, required: true, index: true },
  user: { type: String, trim: true }
}, { timestamps: true });

neplmsCourseMaterialWatchSchema.index({ colid: 1, materialid: 1, regno: 1 }, { unique: true });

module.exports = mongoose.model("neplmscoursematerialwatchds", neplmsCourseMaterialWatchSchema);
