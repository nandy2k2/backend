const mongoose = require("mongoose");

const OnlineExam2AttachmentSchema = new mongoose.Schema({
  title: String,
  label: String,
  url: String,
  filename: String,
  mimetype: String
}, { _id: false });

const OnlineExam2ContentBlockSchema = new mongoose.Schema({
  blocktype: String,
  text: String,
  tabledata: [[String]],
  url: String,
  filename: String,
  title: String,
  dataurl: String,
  color: String,
  brushsize: Number
}, { _id: false });

const OnlineExam2OptionSchema = new mongoose.Schema({
  optiontext: String,
  iscorrect: { type: Boolean, default: false }
}, { _id: true });

const OnlineExam2QuestionSchema = new mongoose.Schema({
  questiontext: String,
  questionhtml: String,
  mathematicalexpression: String,
  tabledata: [[String]],
  drawingdataurl: String,
  questiontype: { type: String, default: "MCQ" },
  marks: { type: Number, default: 1 },
  modules: [{ type: String, trim: true }],
  topics: [{ type: String, trim: true }],
  cos: [{ type: String, trim: true }],
  bloomlevels: [{ type: String, trim: true }],
  options: [OnlineExam2OptionSchema],
  imageurl: String,
  imagefilename: String,
  fileurl: String,
  filefilename: String,
  linkurl: String,
  attachments: [OnlineExam2AttachmentSchema],
  contentblocks: [OnlineExam2ContentBlockSchema],
  order: { type: Number, default: 0 }
}, { _id: true });

const OnlineExam2SectionSchema = new mongoose.Schema({
  sectionname: String,
  sectiontype: { type: String, default: "MCQ" },
  instructions: String,
  order: { type: Number, default: 0 },
  questions: [OnlineExam2QuestionSchema]
}, { _id: true });

const OnlineExam2Schema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  academicyear: { type: String, index: true },
  category: String,
  program: String,
  programcode: { type: String, index: true },
  semester: { type: String, index: true },
  course: String,
  coursecode: { type: String, index: true },
  examname: String,
  examcode: { type: String, index: true },
  durationminutes: { type: Number, default: 60 },
  timezone: { type: String, default: "UTC" },
  instructions: String,
  status: { type: String, default: "Draft" },
  isstarted: { type: String, enum: ["Yes", "No"], default: "No", index: true },
  startedat: Date,
  stoppedat: Date,
  allowseconddevice: { type: String, enum: ["Yes", "No"], default: "No" },
  sections: [OnlineExam2SectionSchema],
  user: String,
  username: String
}, { timestamps: true });

OnlineExam2Schema.index({ colid: 1, academicyear: 1, programcode: 1, coursecode: 1, examcode: 1 });

module.exports = mongoose.models.onlineexam2ds || mongoose.model("onlineexam2ds", OnlineExam2Schema);
