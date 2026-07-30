const mongoose = require("mongoose");

const answerSchema = new mongoose.Schema(
  {
    questionid: { type: String, trim: true },
    selectedoptions: [{ type: String, trim: true }],
    score: { type: Number, default: 0 },
    maxscore: { type: Number, default: 0 }
  },
  { _id: false }
);

const nepLmsQuizAttemptSchema = new mongoose.Schema(
  {
    quizid: { type: mongoose.Schema.Types.ObjectId, ref: "neplmsquizds", required: true },
    quiztitle: { type: String, trim: true },
    academicyear: { type: String, trim: true },
    regulation: { type: String, trim: true },
    program: { type: String, trim: true },
    programcode: { type: String, trim: true },
    type: { type: String, trim: true },
    major: { type: String, trim: true },
    semester: { type: String, trim: true },
    course: { type: String, trim: true },
    coursecode: { type: String, trim: true },
    coursegroup: { type: String, trim: true },
    faculty: { type: String, trim: true },
    facultyemail: { type: String, trim: true },
    student: { type: String, trim: true },
    regno: { type: String, trim: true },
    email: { type: String, trim: true },
    phone: { type: String, trim: true },
    answers: [answerSchema],
    totalmarks: { type: Number, default: 0 },
    obtainedmarks: { type: Number, default: 0 },
    submitteddate: { type: Date, default: Date.now },
    status: { type: String, trim: true, default: "Submitted" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

nepLmsQuizAttemptSchema.index({ colid: 1, quizid: 1, regno: 1 }, { unique: true });
nepLmsQuizAttemptSchema.index({ colid: 1, academicyear: 1, semester: 1, coursecode: 1, regno: 1 });

module.exports = mongoose.model("neplmsquizattemptds", nepLmsQuizAttemptSchema);
