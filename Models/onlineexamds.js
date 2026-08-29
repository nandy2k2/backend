const mongoose = require("mongoose");

const OnlineExamAttachmentSchema = new mongoose.Schema({
  title: String,
  label: String,
  url: String,
  filename: String,
  mimetype: String
}, { _id: false });

const OnlineExamContentBlockSchema = new mongoose.Schema({
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

const OnlineExamOptionSchema = new mongoose.Schema({
  optiontext: String,
  iscorrect: { type: Boolean, default: false }
}, { _id: true });

const OnlineExamQuestionSchema = new mongoose.Schema({
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
  options: [OnlineExamOptionSchema],
  imageurl: String,
  imagefilename: String,
  fileurl: String,
  filefilename: String,
  linkurl: String,
  attachments: [OnlineExamAttachmentSchema],
  contentblocks: [OnlineExamContentBlockSchema],
  order: { type: Number, default: 0 }
}, { _id: true });

const OnlineExamSectionSchema = new mongoose.Schema({
  sectionname: String,
  sectiontype: { type: String, default: "MCQ" },
  instructions: String,
  order: { type: Number, default: 0 },
  questions: [OnlineExamQuestionSchema]
}, { _id: true });

const OnlineExamSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  examcontext: { type: String, default: "Student", index: true },
  academicyear: { type: String, index: true },
  category: String,
  program: String,
  programcode: { type: String, index: true },
  course: String,
  coursecode: { type: String, index: true },
  examname: String,
  examcode: { type: String, index: true },
  durationminutes: { type: Number, default: 60 },
  starttime: Date,
  endtime: Date,
  timezone: { type: String, default: "Asia/Kolkata" },
  instructions: String,
  status: { type: String, default: "Draft" },
  sections: [OnlineExamSectionSchema],
  user: String,
  username: String
}, { timestamps: true });

OnlineExamSchema.index({ colid: 1, academicyear: 1, programcode: 1, coursecode: 1, examcode: 1 });

module.exports = mongoose.model("onlineexamds", OnlineExamSchema);
