const mongoose = require("mongoose");

const optionSchema = new mongoose.Schema(
  {
    text: { type: String, trim: true },
    iscorrect: { type: Boolean, default: false }
  },
  { _id: false }
);

const questionSchema = new mongoose.Schema(
  {
    question: { type: String, trim: true },
    options: [optionSchema],
    score: { type: Number, default: 1 },
    imageLink: { type: String, trim: true },
    videoLink: { type: String, trim: true },
    fileLink: { type: String, trim: true }
  },
  { timestamps: true }
);

const sectionSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true },
    questions: [questionSchema]
  },
  { timestamps: true }
);

const nepLmsLiveQuizSchema = new mongoose.Schema(
  {
    academicyear: { type: String, trim: true },
    regulation: { type: String, trim: true },
    program: { type: String, trim: true },
    programcode: { type: String, trim: true },
    type: { type: String, trim: true },
    major: { type: String, trim: true },
    semester: { type: String, trim: true },
    course: { type: String, trim: true },
    coursecode: { type: String, trim: true },
    faculty: { type: String, trim: true },
    facultyemail: { type: String, trim: true },
    title: { type: String, trim: true, required: true },
    startdatetime: { type: Date, required: true },
    enddatetime: { type: Date, required: true },
    sections: [sectionSchema],
    status: { type: String, trim: true, default: "Active" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

nepLmsLiveQuizSchema.index({ colid: 1, academicyear: 1, semester: 1, coursecode: 1, facultyemail: 1 });

module.exports = mongoose.model("neplmslivequizds", nepLmsLiveQuizSchema);
