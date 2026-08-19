const mongoose = require("mongoose");

const conductExamModeratorSchema = new mongoose.Schema({
  colid: { type: Number, required: true, index: true },
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
  moderatorname: { type: String, required: true, trim: true },
  moderatoremail: { type: String, required: true, trim: true, lowercase: true },
  startdate: { type: Date },
  enddate: { type: Date },
  admindocuments: [{
    title: { type: String, trim: true },
    filename: { type: String, trim: true },
    url: { type: String, trim: true },
    uploadedby: { type: String, trim: true },
    uploadeddate: { type: Date, default: Date.now }
  }],
  status: { type: String, trim: true, default: "assigned" },
  user: { type: String, trim: true }
}, { timestamps: true });

conductExamModeratorSchema.index({
  colid: 1,
  academicyear: 1,
  examcode: 1,
  programcode: 1,
  coursecode: 1,
  moderatoremail: 1
}, { unique: true });

module.exports = mongoose.model("conductexammoderatords", conductExamModeratorSchema);
