const mongoose = require("mongoose");

const descriptiveAnswerSchema = new mongoose.Schema(
  {
    sectionid: { type: String, trim: true },
    sectiontitle: { type: String, trim: true },
    questionid: { type: String, trim: true },
    question: { type: String, trim: true },
    questionimageurl: { type: String, trim: true },
    questionfileurl: { type: String, trim: true },
    questionfilename: { type: String, trim: true },
    questionvideourl: { type: String, trim: true },
    conumber: { type: String, trim: true },
    co: { type: String, trim: true },
    bloomlevel: { type: String, trim: true },
    answer: { type: String, trim: true },
    answerimageurl: { type: String, trim: true },
    answerimagefilename: { type: String, trim: true },
    maxmarks: { type: Number, default: 0 },
    marks: { type: Number, default: 0 },
    aiMarks: { type: Number, default: 0 },
    facultycomments: { type: String, trim: true },
    aiFeedback: { type: String, trim: true }
  },
  { _id: false }
);

const nepLmsDescriptiveAttemptSchema = new mongoose.Schema(
  {
    assessmentid: { type: mongoose.Schema.Types.ObjectId, ref: "neplmsdescriptiveassessmentds", required: true },
    assessmenttitle: { type: String, trim: true },
    academicyear: { type: String, trim: true },
    regulation: { type: String, trim: true },
    program: { type: String, trim: true },
    programcode: { type: String, trim: true },
    type: { type: String, trim: true },
    major: { type: String, trim: true },
    subject: { type: String, trim: true },
    semester: { type: String, trim: true },
    course: { type: String, trim: true },
    coursecode: { type: String, trim: true },
    section: { type: String, trim: true },
    faculty: { type: String, trim: true },
    facultyemail: { type: String, trim: true },
    student: { type: String, trim: true },
    regno: { type: String, trim: true },
    email: { type: String, trim: true },
    phone: { type: String, trim: true },
    answers: [descriptiveAnswerSchema],
    totalmarks: { type: Number, default: 0 },
    obtainedmarks: { type: Number, default: 0 },
    submitteddate: { type: Date, default: Date.now },
    evaluateddate: { type: Date },
    status: { type: String, trim: true, default: "Submitted" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

nepLmsDescriptiveAttemptSchema.index({ colid: 1, assessmentid: 1, regno: 1 }, { unique: true });
nepLmsDescriptiveAttemptSchema.index({ colid: 1, academicyear: 1, semester: 1, coursecode: 1, regno: 1 });

module.exports = mongoose.model("neplmsdescriptiveattemptds", nepLmsDescriptiveAttemptSchema);
