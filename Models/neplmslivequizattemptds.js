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

const nepLmsLiveQuizAttemptSchema = new mongoose.Schema(
  {
    livequizid: { type: mongoose.Schema.Types.ObjectId, ref: "neplmslivequizds", required: true },
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
    faculty: { type: String, trim: true },
    facultyemail: { type: String, trim: true },
    student: { type: String, trim: true },
    regno: { type: String, trim: true },
    email: { type: String, trim: true },
    phone: { type: String, trim: true },
    answers: [answerSchema],
    totalmarks: { type: Number, default: 0 },
    obtainedmarks: { type: Number, default: 0 },
    scorecomments: { type: String, trim: true },
    scoreeditedby: { type: String, trim: true },
    scoreediteddate: Date,
    lastactivitydate: { type: Date, default: Date.now },
    submitteddate: Date,
    status: { type: String, trim: true, default: "Draft" },
    colid: { type: Number, required: true, index: true },
    user: { type: String, trim: true }
  },
  { timestamps: true }
);

nepLmsLiveQuizAttemptSchema.index({ colid: 1, livequizid: 1, regno: 1 }, { unique: true });
nepLmsLiveQuizAttemptSchema.index({ colid: 1, academicyear: 1, semester: 1, coursecode: 1, regno: 1 });

module.exports = mongoose.model("neplmslivequizattemptds", nepLmsLiveQuizAttemptSchema);
