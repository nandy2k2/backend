const mongoose = require("mongoose");

const OnlineExam2ResponseAttachmentSchema = new mongoose.Schema({
  title: String,
  label: String,
  url: String,
  filename: String,
  mimetype: String
}, { _id: false });

const OnlineExam2AnswerContentBlockSchema = new mongoose.Schema({
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

const OnlineExam2AnswerSchema = new mongoose.Schema({
  sectionid: String,
  sectionname: String,
  questionid: String,
  questiontext: String,
  questionhtml: String,
  mathematicalexpression: String,
  tabledata: [[String]],
  drawingdataurl: String,
  imageurl: String,
  imagefilename: String,
  fileurl: String,
  filefilename: String,
  linkurl: String,
  contentblocks: [OnlineExam2AnswerContentBlockSchema],
  questiontype: String,
  selectedoptionid: String,
  selectedoptiontext: String,
  answertext: String,
  attachmenturl: String,
  attachments: [OnlineExam2ResponseAttachmentSchema],
  maxmarks: { type: Number, default: 0 },
  marksobtained: { type: Number, default: 0 },
  grade: String,
  comments: String,
  aicomments: String,
  gradingstatus: { type: String, default: "Pending" }
}, { _id: true });

const OnlineExam2AttemptSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  examid: { type: mongoose.Schema.Types.ObjectId, ref: "onlineexam2ds", index: true },
  category: String,
  examname: String,
  examcode: String,
  academicyear: String,
  program: String,
  programcode: String,
  semester: String,
  section: String,
  course: String,
  coursecode: String,
  student: String,
  email: String,
  regno: { type: String, index: true },
  ipaddress: String,
  useragent: String,
  deviceid: String,
  starttime: Date,
  lastheartbeat: Date,
  submittime: Date,
  status: { type: String, default: "Started" },
  autosubmitted: { type: String, default: "No" },
  submitreason: String,
  barred: { type: String, enum: ["Yes", "No"], default: "No" },
  barreason: String,
  barredat: Date,
  reactivatedat: Date,
  instructionsunderstood: { type: String, enum: ["Yes", "No"], default: "No" },
  hardwareok: { type: String, enum: ["Yes", "No"], default: "No" },
  declarationip: String,
  declarationuseragent: String,
  declarationat: Date,
  remainingseconds: { type: Number, default: 0 },
  totalmarks: { type: Number, default: 0 },
  marksobtained: { type: Number, default: 0 },
  grade: String,
  comments: String,
  answers: [OnlineExam2AnswerSchema]
}, { timestamps: true });

OnlineExam2AttemptSchema.index({ colid: 1, examid: 1, regno: 1 }, { unique: true });

module.exports = mongoose.models.onlineexam2attemptds || mongoose.model("onlineexam2attemptds", OnlineExam2AttemptSchema);
