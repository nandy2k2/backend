const mongoose = require("mongoose");

const examModel2ScoreTypeMarksSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  academicyear: { type: String, required: true, trim: true },
  regulation: { type: String, trim: true, default: "" },
  program: { type: String, trim: true, default: "" },
  programcode: { type: String, required: true, trim: true },
  semester: { type: String, required: true, trim: true },
  student: { type: String, trim: true, default: "" },
  regno: { type: String, required: true, trim: true },
  email: { type: String, trim: true, default: "" },
  course: { type: String, trim: true, default: "" },
  coursecode: { type: String, required: true, trim: true },
  credit: { type: Number, default: 0 },
  type: { type: String, enum: ["Theory", "Practical", "Viva", ""], trim: true, default: "" },
  internalmax: { type: Number, default: 0 },
  internalobtained: { type: Number, default: 0 },
  internalpercentage: { type: Number, default: 0 },
  internalgrade: { type: String, trim: true, default: "" },
  internalstatus: { type: String, enum: ["Pass", "Fail", ""], trim: true, default: "" },
  externalmax: { type: Number, default: 0 },
  externalobtained: { type: Number, default: 0 },
  externalpercentage: { type: Number, default: 0 },
  externalgrade: { type: String, trim: true, default: "" },
  externalstatus: { type: String, enum: ["Pass", "Fail", ""], trim: true, default: "" },
  totalmax: { type: Number, default: 0 },
  totalobtained: { type: Number, default: 0 },
  totalpercentage: { type: Number, default: 0 },
  totalgrade: { type: String, trim: true, default: "" },
  totalstatus: { type: String, enum: ["Pass", "Fail", ""], trim: true, default: "" },
  gpa: { type: Number, default: 0 },
  user: { type: String, trim: true, default: "" }
}, { timestamps: true });

examModel2ScoreTypeMarksSchema.index({
  colid: 1,
  academicyear: 1,
  regulation: 1,
  programcode: 1,
  semester: 1,
  coursecode: 1,
  regno: 1,
  type: 1
}, { unique: true });

module.exports = mongoose.model("exammodel2scoretypemarksds", examModel2ScoreTypeMarksSchema);
