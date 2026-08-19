const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema({
  question: { type: String, trim: true },
  answer: { type: String, trim: true },
  questiontype: { type: String, trim: true, default: "Short Answer Type" },
  difficultylevel: { type: String, trim: true },
  language: { type: String, trim: true },
  marks: { type: Number, default: 0 },
  bloomlevels: [{ type: String, trim: true }],
  conumber: { type: String, trim: true },
  co: { type: String, trim: true },
  attachmenturl: { type: String, trim: true },
  attachmentfilename: { type: String, trim: true },
  aimappingcomments: { type: String, trim: true }
}, { timestamps: true });

const sectionSchema = new mongoose.Schema({
  title: { type: String, trim: true },
  instructions: { type: String, trim: true },
  marks: { type: Number, default: 0 },
  questions: [questionSchema]
}, { timestamps: true });

const conductExamQuestionPaperSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
  papersetterid: { type: mongoose.Schema.Types.ObjectId, ref: "conductexampapersetterds", index: true },
  academicyear: { type: String, required: true, trim: true },
  regulation: { type: String, required: true, trim: true },
  exam: { type: String, required: true, trim: true },
  examcode: { type: String, required: true, trim: true },
  program: { type: String, required: true, trim: true },
  programcode: { type: String, required: true, trim: true },
  type: { type: String, trim: true },
  subject: { type: String, trim: true },
  semester: { type: String, trim: true },
  course: { type: String, required: true, trim: true },
  coursecode: { type: String, required: true, trim: true },
  papersettername: { type: String, required: true, trim: true },
  papersetteremail: { type: String, required: true, trim: true, lowercase: true },
  status: { type: String, trim: true, default: "Draft" },
  paperstatus: { type: String, trim: true, default: "Default" },
  paperattachmenturl: { type: String, trim: true },
  paperattachmentfilename: { type: String, trim: true },
  paperdocuments: [{
    title: { type: String, trim: true },
    filename: { type: String, trim: true },
    url: { type: String, trim: true },
    uploadedby: { type: String, trim: true },
    uploadeddate: { type: Date, default: Date.now }
  }],
  moderationdocuments: [{
    title: { type: String, trim: true },
    filename: { type: String, trim: true },
    url: { type: String, trim: true },
    uploadedby: { type: String, trim: true },
    uploadeddate: { type: Date, default: Date.now }
  }],
  reviewdocuments: [{
    title: { type: String, trim: true },
    filename: { type: String, trim: true },
    url: { type: String, trim: true },
    uploadedby: { type: String, trim: true },
    uploadeddate: { type: Date, default: Date.now }
  }],
  sections: [sectionSchema],
  airesponse: { type: String, trim: true },
  blockchainhash: { type: String, trim: true },
  blockchainverificationurl: { type: String, trim: true },
  acceptedby: { type: String, trim: true },
  accepteddate: { type: Date },
  user: { type: String, trim: true }
}, { timestamps: true });

conductExamQuestionPaperSchema.index({
  colid: 1,
  academicyear: 1,
  examcode: 1,
  programcode: 1,
  coursecode: 1,
  papersetteremail: 1
}, { unique: true });

module.exports = mongoose.model("conductexamquestionpaperds", conductExamQuestionPaperSchema);
