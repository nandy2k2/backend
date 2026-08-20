const mongoose = require("mongoose");

const OnlineExamResponseAttachmentSchema = new mongoose.Schema({
  label: String,
  url: String,
  filename: String,
  mimetype: String
}, { _id: false });

const OnlineExamAnswerSchema = new mongoose.Schema({
  sectionid: String,
  sectionname: String,
  questionid: String,
  questiontext: String,
  questiontype: String,
  selectedoptionid: String,
  selectedoptiontext: String,
  answertext: String,
  attachmenturl: String,
  attachments: [OnlineExamResponseAttachmentSchema],
  maxmarks: { type: Number, default: 0 },
  marksobtained: { type: Number, default: 0 },
  grade: String,
  comments: String,
  aicomments: String,
  gradingstatus: { type: String, default: "Pending" }
}, { _id: true });

const OnlineExamAttemptSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  examcontext: { type: String, default: "Student", index: true },
  examid: { type: mongoose.Schema.Types.ObjectId, ref: "onlineexamds", index: true },
  applicantid: String,
  applicationnumber: String,
  category: String,
  examname: String,
  examcode: String,
  academicyear: String,
  program: String,
  programcode: String,
  course: String,
  coursecode: String,
  student: String,
  email: String,
  regno: { type: String, index: true },
  starttime: Date,
  submittime: Date,
  status: { type: String, default: "Started" },
  autosubmitted: { type: String, default: "No" },
  submitreason: String,
  remainingseconds: { type: Number, default: 0 },
  totalmarks: { type: Number, default: 0 },
  marksobtained: { type: Number, default: 0 },
  grade: String,
  comments: String,
  answers: [OnlineExamAnswerSchema]
}, { timestamps: true });

OnlineExamAttemptSchema.index({ colid: 1, examid: 1, regno: 1 }, { unique: true });

module.exports = mongoose.model("onlineexamattemptds", OnlineExamAttemptSchema);
